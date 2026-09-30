#!/usr/bin/env node

import {
  appendFile,
  chmod,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import process from 'node:process';

const DEFAULT_CLOUD_URL = 'https://cloud.nx.app';
const NX_CLOUD_API_OPENAPI_PATH = 'nx-cloud/data/openapi.json';

class CliError extends Error {
  constructor(message, nextSteps = []) {
    super(message);
    this.nextSteps = nextSteps;
  }
}

class HttpError extends CliError {
  constructor({ url, status, detail, resource }) {
    const summary =
      {
        401: 'Authentication failed.',
        403: 'Access denied.',
        404: 'The requested resource was not found.',
        409: 'The requested resource is not ready.',
        429: 'Nx Cloud rate limited this request.',
        503: 'The Nx Cloud API is unavailable.',
      }[status] ?? 'The Nx Cloud request failed.';
    super(
      `${summary} GET ${
        new URL(url).pathname
      } returned HTTP ${status}${detail}.`
    );
    this.status = status;
    this.resource = resource;
  }
}

const AUTH_SETUP_STEPS = [
  'Run `nx login --status` from the workspace root to check the Nx Cloud login.',
  'If no personal access token exists, run `nx login` from the workspace root to create one.',
  'Confirm that nx.json contains the expected nxCloudId and nxCloudUrl.',
  'Set NX_CLOUD_PERSONAL_ACCESS_TOKEN in a secure environment only when you need an explicit override.',
  'Run the request again from the workspace root.',
];

const HELP = `Nx Cloud API client

Usage:
  nx-cloud-api.mjs catalog [options]
  nx-cloud-api.mjs describe <endpoint-or-path> [options]
  nx-cloud-api.mjs request <endpoint-or-path-or-link> [options]

Commands:
  catalog                  List live Nx Cloud API GET operations.
  describe <selector>      Show live parameters and response fields.
  request <selector>       Make a validated, read-only request.

Common options:
  --workspace <directory>  Find nx.json from this directory.
  --cloud-url <url>        Override nxCloudUrl or NX_CLOUD_URL.
  --cloud-id <id>          Override nxCloudId or NX_CLOUD_ID.
  --token-file <file>      Read one workspace access token from a private file.
  --config <file>          Read the personal access token from this INI file.
  --spec <file>            Read an OpenAPI document from a local JSON file.
  --json                   Emit machine-readable output for catalog or describe.

Request options:
  --path name=value        Fill a path parameter. Repeat as needed.
  --query name=value       Add a query parameter. Repeat for array filters.
  --page-size <count>      Set the documented limit query parameter.
  --pages <count>          Fetch this many pages at most. Default: 1.
  --format json|ndjson     Select response output. Default: json.
  --out <file>             Write output with owner-only permissions.
  --metadata-out <file>    Write pagination metadata with owner-only permissions.
  --dry-run                Validate and print the request without credentials or data.

Credentials:
  The client uses NX_CLOUD_ACCESS_TOKEN or NX_CLOUD_AUTH_TOKEN as an
  Authorization bearer token. Otherwise it uses a personal access token with
  an Nx Cloud ID. It reads NX_CLOUD_PERSONAL_ACCESS_TOKEN first, then the
  URL-matched personalAccessToken from ~/.config/nxcloud/nxcloud.ini.
  --token-file is a safe explicit workspace-token override. The file must be
  private and contain only the token. Do not pass a token on a command line.

Safe workflow:
  1. Run describe for a known endpoint. Use catalog only to discover a route.
  2. Run request with --dry-run. This checks the request shape only.
  3. Save one filtered page with --out, then use jq to select needed fields.
  4. Increase --pages only when results require it.

A dry run does not read a token or verify workspace access. The Nx Cloud API is
read-only and is not for live CI monitoring.
`;

function printHelp() {
  process.stdout.write(HELP);
}

function parseArgs(argv) {
  const args = [...argv];
  if (
    args.length === 0 ||
    args[0] === '--help' ||
    args[0] === '-h' ||
    args[0] === 'help'
  ) {
    return { command: 'help', positionals: [], options: {} };
  }

  const command = args.shift();
  const optionNames = {
    workspace: 'workspace',
    'cloud-url': 'cloudUrl',
    'cloud-id': 'cloudId',
    'token-file': 'tokenFile',
    config: 'config',
    spec: 'spec',
    path: 'path',
    query: 'query',
    pages: 'pages',
    'page-size': 'pageSize',
    format: 'format',
    out: 'out',
    'metadata-out': 'metadataOut',
  };
  const booleanOptions = {
    json: 'json',
    'dry-run': 'dryRun',
    help: 'help',
  };
  const repeatableOptions = new Set(['path', 'query']);
  const options = { path: [], query: [] };
  const positionals = [];
  let endOfOptions = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!endOfOptions && arg === '--') {
      endOfOptions = true;
      continue;
    }
    if (!endOfOptions && arg.startsWith('--')) {
      const equalsIndex = arg.indexOf('=');
      const rawName = arg.slice(
        2,
        equalsIndex === -1 ? undefined : equalsIndex
      );
      const inlineValue =
        equalsIndex === -1 ? undefined : arg.slice(equalsIndex + 1);
      if (rawName in booleanOptions) {
        if (inlineValue !== undefined) {
          throw new CliError(`--${rawName} does not accept a value.`);
        }
        options[booleanOptions[rawName]] = true;
        continue;
      }
      if (!(rawName in optionNames)) {
        throw new CliError(
          `Unknown option --${rawName}. Run with --help for usage.`
        );
      }
      const value = inlineValue ?? args[++index];
      if (value === undefined || value === '') {
        throw new CliError(`--${rawName} requires a value.`);
      }
      const optionKey = optionNames[rawName];
      if (repeatableOptions.has(optionKey)) {
        options[optionKey].push(value);
      } else if (options[optionKey] !== undefined) {
        throw new CliError(`--${rawName} can be specified only once.`);
      } else {
        options[optionKey] = value;
      }
      continue;
    }
    positionals.push(arg);
  }

  if (options.help) return { command: 'help', positionals, options };
  if (!['catalog', 'describe', 'request'].includes(command)) {
    throw new CliError(
      `Unknown command ${JSON.stringify(command)}. Run with --help for usage.`
    );
  }
  if (command === 'catalog' && positionals.length !== 0) {
    throw new CliError('catalog does not accept an endpoint selector.');
  }
  if (
    (command === 'describe' || command === 'request') &&
    positionals.length !== 1
  ) {
    throw new CliError(`${command} requires exactly one endpoint selector.`);
  }
  if (command !== 'request') {
    for (const key of ['path', 'query']) {
      if (options[key].length > 0)
        throw new CliError(`--${key} is valid only with request.`);
    }
    for (const key of [
      'pages',
      'pageSize',
      'format',
      'out',
      'metadataOut',
      'dryRun',
    ]) {
      if (options[key] !== undefined && options[key] !== false) {
        throw new CliError(
          `--${key.replace(
            /[A-Z]/g,
            (letter) => `-${letter.toLowerCase()}`
          )} is valid only with request.`
        );
      }
    }
  }
  if (command === 'request' && options.json) {
    throw new CliError('Use --format json with request.');
  }

  return { command, positionals, options };
}

function parseNaturalNumber(value, optionName) {
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw new CliError(`${optionName} must be a positive integer.`);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new CliError(`${optionName} is too large.`);
  }
  return number;
}

function parseKeyValue(value, optionName) {
  const index = value.indexOf('=');
  if (index <= 0) {
    throw new CliError(`${optionName} must use name=value syntax.`);
  }
  return [value.slice(0, index), value.slice(index + 1)];
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function findNxJson(workspaceOption) {
  let start = resolve(workspaceOption ?? process.cwd());
  if (await isFile(start)) {
    if (basename(start) !== 'nx.json') {
      throw new CliError(
        `--workspace must be a directory or an nx.json file: ${start}`
      );
    }
    return start;
  }
  if (!(await isDirectory(start))) {
    if (workspaceOption)
      throw new CliError(`Workspace path does not exist: ${start}`);
    return null;
  }

  while (true) {
    const candidate = join(start, 'nx.json');
    if (await isFile(candidate)) return candidate;
    const parent = dirname(start);
    if (parent === start) return null;
    start = parent;
  }
}

async function readNxConfig(nxJsonPath) {
  try {
    const parsed = JSON.parse(await readFile(nxJsonPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('The file does not contain a JSON object.');
    }
    return parsed;
  } catch (error) {
    throw new CliError(`Cannot read ${nxJsonPath}: ${error.message}`);
  }
}

function normalizeCloudUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new CliError(`Invalid Nx Cloud URL: ${value}`);
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new CliError(`Nx Cloud URL must use HTTP or HTTPS: ${value}`);
  }
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) url.pathname += '/';
  return url.toString();
}

function cloudUrlIdentity(value) {
  const url = new URL(normalizeCloudUrl(value));
  const pathname = url.pathname.replace(/\/+$/, '');
  return `${url.protocol}//${url.host}${pathname}`;
}

function openApiUrl(cloudUrl) {
  return new URL(
    NX_CLOUD_API_OPENAPI_PATH,
    normalizeCloudUrl(cloudUrl)
  ).toString();
}

async function resolveCloudContext(options, { requireCloudId }) {
  const needsNxConfig =
    Boolean(options.workspace) ||
    (!options.cloudUrl && !process.env.NX_CLOUD_URL) ||
    (requireCloudId && !options.cloudId && !process.env.NX_CLOUD_ID);
  const nxJsonPath = needsNxConfig ? await findNxJson(options.workspace) : null;
  if (options.workspace && !nxJsonPath) {
    throw new CliError(
      `Could not find nx.json from ${resolve(options.workspace)}.`,
      [
        'Pass the Nx workspace root to --workspace.',
        'Or run this command from a directory below the workspace root.',
        'Use --cloud-url and --cloud-id only when you intentionally query a workspace without local configuration.',
      ]
    );
  }
  const nxConfig = nxJsonPath ? await readNxConfig(nxJsonPath) : null;
  const cloudUrl = normalizeCloudUrl(
    options.cloudUrl ??
      process.env.NX_CLOUD_URL ??
      nxConfig?.nxCloudUrl ??
      DEFAULT_CLOUD_URL
  );
  const cloudId =
    options.cloudId ?? process.env.NX_CLOUD_ID ?? nxConfig?.nxCloudId;
  if (requireCloudId && (typeof cloudId !== 'string' || cloudId.length === 0)) {
    throw new CliError('No Nx Cloud ID is available for this request.', [
      'Run this command from the Nx workspace root, or pass --workspace <directory>.',
      'Add nxCloudId to nx.json, or set NX_CLOUD_ID for this command environment.',
      'Confirm that the ID belongs to the Nx Cloud workspace you want to inspect.',
    ]);
  }
  return { cloudUrl, cloudId, nxJsonPath };
}

function parseIni(contents) {
  const sections = [];
  let current = null;
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sectionMatch = /^\[(.*)]$/.exec(line);
    if (sectionMatch) {
      current = { name: sectionMatch[1].trim(), values: new Map() };
      sections.push(current);
      continue;
    }
    const valueMatch = /^([^=]+?)\s*=\s*(.*)$/.exec(line);
    if (!valueMatch || !current) continue;
    let value = valueMatch[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    current.values.set(valueMatch[1].trim().toLowerCase(), value);
  }
  return sections;
}

function unescapeIniSection(value) {
  return value.replace(/\\(.)/g, '$1');
}

async function readWorkspaceAccessTokenFile(pathValue) {
  const path = resolve(pathValue);
  let fileStat;
  let token;
  try {
    fileStat = await stat(path);
    token = (await readFile(path, 'utf8')).trim();
  } catch (error) {
    throw new CliError(
      `Cannot read workspace access token file ${path}: ${error.message}`
    );
  }
  if (!fileStat.isFile())
    throw new CliError(`Workspace access token path is not a file: ${path}`);
  if (process.platform !== 'win32' && (fileStat.mode & 0o077) !== 0) {
    throw new CliError(
      `Workspace access token file permissions are too broad: ${path}`,
      [`Run chmod 600 ${path} before the request.`]
    );
  }
  if (!token || /\s/.test(token)) {
    throw new CliError(
      `Workspace access token file must contain one non-empty token without whitespace: ${path}`
    );
  }
  return token;
}

async function resolveWorkspaceAccessToken(options) {
  const accessToken = process.env.NX_CLOUD_ACCESS_TOKEN;
  const authToken = process.env.NX_CLOUD_AUTH_TOKEN;
  if (accessToken && authToken && accessToken !== authToken) {
    throw new CliError(
      'NX_CLOUD_ACCESS_TOKEN and NX_CLOUD_AUTH_TOKEN contain different workspace access tokens.',
      [
        'Keep only the workspace access token for the intended workspace in this command environment.',
        'Do not print either token while you correct the environment.',
      ]
    );
  }
  const environmentToken = accessToken ?? authToken ?? null;
  if (options.tokenFile && environmentToken) {
    throw new CliError(
      'Use either --token-file or a workspace access token environment variable, not both.'
    );
  }
  return options.tokenFile
    ? readWorkspaceAccessTokenFile(options.tokenFile)
    : environmentToken;
}

async function resolvePersonalAccessToken(options, cloudUrl) {
  if (process.env.NX_CLOUD_PERSONAL_ACCESS_TOKEN) {
    return process.env.NX_CLOUD_PERSONAL_ACCESS_TOKEN;
  }
  const configPath = resolve(
    options.config ?? join(homedir(), '.config', 'nxcloud', 'nxcloud.ini')
  );
  let contents;
  try {
    contents = await readFile(configPath, 'utf8');
  } catch {
    throw new CliError(
      `No personal access token is available. The client did not find NX_CLOUD_PERSONAL_ACCESS_TOKEN or ${configPath}.`,
      AUTH_SETUP_STEPS
    );
  }
  const expectedUrl = cloudUrlIdentity(cloudUrl);
  const matches = parseIni(contents).filter((section) => {
    const token = section.values.get('personalaccesstoken');
    if (!token) return false;
    try {
      return cloudUrlIdentity(unescapeIniSection(section.name)) === expectedUrl;
    } catch {
      return false;
    }
  });
  if (matches.length === 0) {
    throw new CliError(
      `No personal access token in ${configPath} matches the configured Nx Cloud URL (${expectedUrl}).`,
      [
        'Run `nx login --status` from the workspace root to check the Nx Cloud login.',
        'Run `nx login` from the workspace root to create a PAT for this workspace.',
        'Confirm nxCloudUrl or NX_CLOUD_URL for this workspace.',
        'Do not pass a token on a command line.',
      ]
    );
  }
  if (matches.length > 1) {
    throw new CliError(
      `Multiple personal access token entries in ${configPath} match ${expectedUrl}.`,
      [
        'Keep one token entry for this Nx Cloud URL.',
        'Or set NX_CLOUD_PERSONAL_ACCESS_TOKEN securely for this command environment.',
      ]
    );
  }
  return matches[0].values.get('personalaccesstoken');
}

async function resolveAuthentication(options, context, workspaceAccessToken) {
  if (workspaceAccessToken) {
    return {
      type: 'workspaceAccessToken',
      headers: { Authorization: `Bearer ${workspaceAccessToken}` },
    };
  }
  const personalAccessToken = await resolvePersonalAccessToken(
    options,
    context.cloudUrl
  );
  return {
    type: 'personalAccessToken',
    headers: {
      'Nx-Cloud-Id': context.cloudId,
      'Nx-Cloud-Personal-Access-Token': personalAccessToken,
    },
  };
}

function parseJson(text, source) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new CliError(`Cannot parse JSON from ${source}: ${error.message}`);
  }
}

function errorDetailFromBody(text) {
  try {
    const body = JSON.parse(text);
    const code = typeof body.code === 'string' ? body.code : null;
    const message = typeof body.message === 'string' ? body.message : null;
    const detail = [code, message].filter(Boolean).join(': ');
    return detail ? ` (${detail})` : '';
  } catch {
    return '';
  }
}

async function fetchJson(url, headers = {}) {
  let response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json', ...headers },
      redirect: 'follow',
    });
  } catch (error) {
    throw new CliError(
      `Network request failed for ${new URL(url).pathname}: ${error.message}`
    );
  }
  const text = await response.text();
  if (!response.ok) {
    throw new HttpError({
      url,
      status: response.status,
      detail: errorDetailFromBody(text),
      resource: 'OpenAPI document',
    });
  }
  return parseJson(text, new URL(url).pathname);
}

async function loadOpenApi(specPath, cloudUrl) {
  let spec;
  if (specPath) {
    const path = resolve(specPath);
    try {
      spec = parseJson(await readFile(path, 'utf8'), path);
    } catch (error) {
      if (error instanceof CliError) throw error;
      throw new CliError(`Cannot read OpenAPI file ${path}: ${error.message}`);
    }
  } else {
    spec = await fetchJson(openApiUrl(cloudUrl));
  }
  if (
    !spec ||
    typeof spec !== 'object' ||
    !spec.paths ||
    typeof spec.paths !== 'object'
  ) {
    throw new CliError('The OpenAPI document has no paths object.');
  }
  return spec;
}

function resolveReference(spec, value) {
  let current = value;
  const seen = new Set();
  while (
    current &&
    typeof current === 'object' &&
    typeof current.$ref === 'string' &&
    current.$ref.startsWith('#/')
  ) {
    if (seen.has(current.$ref)) break;
    seen.add(current.$ref);
    const parts = current.$ref
      .slice(2)
      .split('/')
      .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'));
    let resolved = spec;
    for (const part of parts) resolved = resolved?.[part];
    if (!resolved) break;
    current = resolved;
  }
  return current;
}

function listOperations(spec) {
  return Object.entries(spec.paths)
    .flatMap(([path, pathItem]) => {
      const item = resolveReference(spec, pathItem);
      if (!item?.get || !path.startsWith('/nx-cloud/data/')) return [];
      return [
        {
          path,
          item,
          operation: resolveReference(spec, item.get),
          method: 'GET',
        },
      ];
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

function parametersFor(spec, entry) {
  const parameters = new Map();
  for (const parameter of [
    ...(entry.item.parameters ?? []),
    ...(entry.operation.parameters ?? []),
  ]) {
    const resolved = resolveReference(spec, parameter);
    if (!resolved?.name || !resolved?.in) continue;
    parameters.set(`${resolved.in}:${resolved.name}`, resolved);
  }
  return [...parameters.values()];
}

function schemaSummary(spec, schema, depth = 0) {
  const source = schema ?? {};
  const resolved = resolveReference(spec, source);
  if (!resolved || typeof resolved !== 'object') return { type: 'unknown' };
  const type = Array.isArray(resolved.type)
    ? resolved.type.join('|')
    : resolved.type ?? 'unknown';
  const itemSchema = resolved.items
    ? resolveReference(spec, resolved.items)
    : null;
  const enumValues = resolved.enum ?? itemSchema?.enum;
  const result = { type };
  if (typeof source.$ref === 'string')
    result.schema = source.$ref.split('/').at(-1);
  if (resolved.format) result.format = resolved.format;
  if (resolved.title) result.title = resolved.title;
  if (enumValues) result.enum = enumValues;
  for (const constraint of [
    'minimum',
    'maximum',
    'minItems',
    'maxItems',
    'uniqueItems',
    'pattern',
  ]) {
    if (resolved[constraint] !== undefined)
      result[constraint] = resolved[constraint];
  }
  if (Array.isArray(resolved.required))
    result.required = [...resolved.required].sort();
  if (resolved.properties) {
    result.properties = Object.keys(resolved.properties).sort();
    if (depth < 2) {
      result.fields = Object.fromEntries(
        Object.entries(resolved.properties)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([name, property]) => [
            name,
            schemaSummary(spec, property, depth + 1),
          ])
      );
    }
  }
  if (itemSchema) result.items = schemaSummary(spec, resolved.items, depth + 1);
  for (const keyword of ['oneOf', 'anyOf', 'allOf']) {
    if (Array.isArray(resolved[keyword]) && depth < 2) {
      result[keyword] = resolved[keyword].map((entry) =>
        schemaSummary(spec, entry, depth + 1)
      );
    }
  }
  return result;
}

function responseContent(spec, responseValue) {
  const response = resolveReference(spec, responseValue);
  const content = response?.content ?? {};
  const mediaType =
    Object.keys(content).find((key) => key.toLowerCase().includes('json')) ??
    Object.keys(content)[0] ??
    null;
  return {
    response,
    mediaType,
    schema: mediaType ? content[mediaType]?.schema ?? null : null,
  };
}

function documentedResponses(spec, entry) {
  return Object.entries(entry.operation.responses ?? {})
    .map(([status, value]) => {
      const content = responseContent(spec, value);
      return {
        status,
        description: content.response?.description ?? '',
        contentType: content.mediaType,
        schema: schemaSummary(spec, content.schema),
        rawSchema: content.schema,
      };
    })
    .sort((left, right) =>
      left.status.localeCompare(right.status, undefined, { numeric: true })
    );
}

function successfulResponse(responses) {
  return (
    responses.find((response) => /^2\d\d$/.test(response.status)) ??
    responses.find((response) => /^3\d\d$/.test(response.status)) ??
    null
  );
}

function collectionItemSummary(spec, schema) {
  const responseSchema = resolveReference(spec, schema ?? {});
  const itemsProperty = resolveReference(
    spec,
    responseSchema?.properties?.items ?? {}
  );
  if (!schemaIncludesType(itemsProperty, 'array')) return null;
  return schemaSummary(spec, itemsProperty.items);
}

function describeSecurity(spec, entry) {
  const requirements = entry.operation.security ?? spec.security ?? [];
  return requirements.map((requirement) =>
    Object.keys(requirement).map((name) => {
      const scheme = resolveReference(
        spec,
        spec.components?.securitySchemes?.[name] ?? {}
      );
      return {
        name,
        type: scheme?.type ?? 'unknown',
        scheme: scheme?.scheme ?? null,
        in: scheme?.in ?? null,
        header: scheme?.name ?? null,
        description: scheme?.description ?? '',
      };
    })
  );
}

function describeOperation(spec, entry) {
  const responses = documentedResponses(spec, entry);
  const success = successfulResponse(responses);
  const response = success
    ? {
        ...success.schema,
        status: success.status,
        description: success.description,
        contentType: success.contentType,
      }
    : { type: 'unknown', status: null, description: '', contentType: null };
  const item = success ? collectionItemSummary(spec, success.rawSchema) : null;
  if (item) response.item = item;
  return {
    method: entry.method,
    path: entry.path,
    summary: entry.operation.summary ?? '',
    description: entry.operation.description ?? '',
    security: describeSecurity(spec, entry),
    parameters: parametersFor(spec, entry).map((parameter) => ({
      in: parameter.in,
      name: parameter.name,
      required: Boolean(parameter.required),
      description: parameter.description ?? '',
      style: parameter.style ?? null,
      explode: parameter.explode ?? null,
      schema: schemaSummary(spec, parameter.schema),
    })),
    response,
    responses: responses.map(
      ({ rawSchema: _rawSchema, ...documented }) => documented
    ),
  };
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchTemplate(template, actualPath) {
  const names = [];
  let pattern = '^';
  let cursor = 0;
  for (const match of template.matchAll(/\{([^}]+)}/g)) {
    pattern += escapeRegExp(template.slice(cursor, match.index));
    pattern += '([^/]+)';
    names.push(match[1]);
    cursor = match.index + match[0].length;
  }
  pattern += escapeRegExp(template.slice(cursor));
  pattern += '$';
  const found = new RegExp(pattern).exec(actualPath);
  if (!found) return null;
  const values = new Map();
  names.forEach((name, index) => {
    try {
      values.set(name, decodeURIComponent(found[index + 1]));
    } catch {
      values.set(name, found[index + 1]);
    }
  });
  return values;
}

function resolveSelector(spec, cloudUrl, selector) {
  const operations = listOperations(spec);
  let pathSelector = selector;
  let linkQueryPairs = [];
  let linkPathValues = new Map();
  const isPathTemplate = selector.includes('{') && selector.includes('}');
  const isAbsoluteLink = /^https?:\/\//i.test(selector);
  const isLink =
    isAbsoluteLink || (selector.startsWith('/') && !isPathTemplate);

  if (isLink) {
    let link;
    try {
      link = new URL(selector, cloudUrl);
    } catch {
      throw new CliError(`Invalid API link: ${selector}`);
    }
    pathSelector = link.pathname;
    linkQueryPairs = [...link.searchParams.entries()];
    const cipeUiMatch = /^\/cipes\/([^/]+)\/?$/.exec(link.pathname);
    if (cipeUiMatch) {
      const cipeOperation = operations.find((entry) =>
        /\/cipes\/\{[^}]+}$/.test(entry.path)
      );
      if (!cipeOperation)
        throw new CliError(
          'The supplied CIPE URL has no matching Nx Cloud API operation.'
        );
      pathSelector = cipeOperation.path.replace(
        /\{[^}]+}/,
        encodeURIComponent(decodeURIComponent(cipeUiMatch[1]))
      );
      linkQueryPairs = [];
    }
  } else if (selector.includes('?')) {
    throw new CliError(
      'Use a full relative API link when a selector contains query parameters.'
    );
  }

  const normalizedSelector = pathSelector.replace(/^\//, '');
  let matches = operations
    .filter(
      (entry) =>
        entry.path === pathSelector ||
        entry.path.replace(/^\//, '') === normalizedSelector ||
        entry.path.endsWith(`/${normalizedSelector}`)
    )
    .map((entry) => ({ entry, pathValues: new Map() }));

  if (matches.length === 0 && isLink) {
    matches = operations
      .map((entry) => ({
        entry,
        pathValues: matchTemplate(entry.path, pathSelector),
      }))
      .filter((candidate) => candidate.pathValues !== null);
  }

  if (matches.length === 0) {
    throw new CliError(
      `No documented GET operation matches ${JSON.stringify(
        selector
      )}. Run catalog first.`
    );
  }
  if (matches.length > 1) {
    const paths = matches.map((candidate) => candidate.entry.path).join(', ');
    throw new CliError(
      `Endpoint selector ${JSON.stringify(selector)} is ambiguous: ${paths}`
    );
  }

  const resolved = matches[0];
  linkPathValues = resolved.pathValues;
  return {
    entry: resolved.entry,
    linkQueryPairs,
    linkPathValues,
    cloudUrl: isAbsoluteLink
      ? normalizeCloudUrl(new URL(selector).origin)
      : cloudUrl,
  };
}

function schemaIncludesType(schema, expected) {
  const type = schema?.type;
  return Array.isArray(type) ? type.includes(expected) : type === expected;
}

function valueSchema(spec, parameter) {
  const schema = resolveReference(spec, parameter.schema ?? {});
  return schemaIncludesType(schema, 'array')
    ? resolveReference(spec, schema.items ?? {})
    : schema;
}

function validateValue(spec, parameter, value) {
  const schema = valueSchema(spec, parameter) ?? {};
  if (schemaIncludesType(schema, 'boolean') && !/^(true|false)$/i.test(value)) {
    throw new CliError(
      `Query parameter ${parameter.name} must be true or false.`
    );
  }
  if (schemaIncludesType(schema, 'integer') && !/^-?\d+$/.test(value)) {
    throw new CliError(`Query parameter ${parameter.name} must be an integer.`);
  }
  if (schemaIncludesType(schema, 'number') && !Number.isFinite(Number(value))) {
    throw new CliError(`Query parameter ${parameter.name} must be a number.`);
  }
  if (schema.minimum !== undefined && Number(value) < schema.minimum) {
    throw new CliError(
      `Query parameter ${parameter.name} must be at least ${schema.minimum}.`
    );
  }
  if (schema.maximum !== undefined && Number(value) > schema.maximum) {
    throw new CliError(
      `Query parameter ${parameter.name} must be at most ${schema.maximum}.`
    );
  }
  if (Array.isArray(schema.enum)) {
    const valid = schema.enum.map(String);
    if (!valid.some((entry) => entry.toLowerCase() === value.toLowerCase())) {
      throw new CliError(
        `Query parameter ${parameter.name} must be one of: ${valid.join(', ')}.`
      );
    }
  }
}

function removeQueryKey(pairs, key) {
  return pairs.filter(([name]) => name !== key);
}

function queryObject(pairs) {
  const result = {};
  for (const [name, value] of pairs) {
    if (result[name] === undefined) result[name] = value;
    else if (Array.isArray(result[name])) result[name].push(value);
    else result[name] = [result[name], value];
  }
  return result;
}

function buildRequestPlan(spec, selection, options) {
  const parameters = parametersFor(spec, selection.entry);
  const pathParameters = new Map(
    parameters
      .filter((parameter) => parameter.in === 'path')
      .map((parameter) => [parameter.name, parameter])
  );
  const queryParameters = new Map(
    parameters
      .filter((parameter) => parameter.in === 'query')
      .map((parameter) => [parameter.name, parameter])
  );
  const userPathPairs = options.path.map((value) =>
    parseKeyValue(value, '--path')
  );
  const userQueryPairs = options.query.map((value) =>
    parseKeyValue(value, '--query')
  );
  const pathValues = new Map(selection.linkPathValues);

  for (const [name, value] of userPathPairs) {
    if (!pathParameters.has(name)) {
      throw new CliError(
        `${name} is not a documented path parameter for ${selection.entry.path}.`
      );
    }
    if (pathValues.has(name)) {
      throw new CliError(
        `Path parameter ${name} already comes from the API link.`
      );
    }
    pathValues.set(name, value);
  }
  for (const parameter of pathParameters.values()) {
    if (parameter.required && !pathValues.has(parameter.name)) {
      throw new CliError(
        `Missing required path parameter --path ${parameter.name}=<value>.`
      );
    }
  }

  const queryPairs = [...selection.linkQueryPairs, ...userQueryPairs];
  if (options.pageSize !== undefined) {
    const pageSize = parseNaturalNumber(options.pageSize, '--page-size');
    const limitParameter = queryParameters.get('limit');
    if (!limitParameter) {
      throw new CliError(
        `${selection.entry.path} has no documented limit parameter.`
      );
    }
    if (queryPairs.some(([name]) => name === 'limit')) {
      throw new CliError(
        'Use either --page-size or --query limit=<count>, not both.'
      );
    }
    validateValue(spec, limitParameter, String(pageSize));
    queryPairs.push(['limit', String(pageSize)]);
  }

  const counts = new Map();
  for (const [name, value] of queryPairs) {
    const parameter = queryParameters.get(name);
    if (!parameter) {
      throw new CliError(
        `${name} is not a documented query parameter for ${selection.entry.path}.`
      );
    }
    counts.set(name, (counts.get(name) ?? 0) + 1);
    if (
      (counts.get(name) ?? 0) > 1 &&
      !schemaIncludesType(
        resolveReference(spec, parameter.schema ?? {}),
        'array'
      )
    ) {
      throw new CliError(`Query parameter ${name} cannot be repeated.`);
    }
    validateValue(spec, parameter, value);
  }

  const expandedPath = selection.entry.path.replace(
    /\{([^}]+)}/g,
    (_match, name) => encodeURIComponent(pathValues.get(name))
  );
  const pages =
    options.pages === undefined
      ? 1
      : parseNaturalNumber(options.pages, '--pages');
  const format = options.format ?? 'json';
  if (!['json', 'ndjson'].includes(format)) {
    throw new CliError('--format must be json or ndjson.');
  }

  const outputPath = options.out ? resolve(options.out) : null;
  const metadataOutputPath = options.metadataOut
    ? resolve(options.metadataOut)
    : null;
  if (outputPath && outputPath === metadataOutputPath) {
    throw new CliError('--out and --metadata-out must use different files.');
  }

  return {
    path: expandedPath,
    queryPairs,
    pages,
    format,
    outputPath,
    metadataOutputPath,
    cursorParameter: queryParameters.get('cursor') ?? null,
    sortParameter: queryParameters.get('sort') ?? null,
  };
}

function requestUrl(cloudUrl, path, queryPairs) {
  const url = new URL(path, cloudUrl);
  url.search = new URLSearchParams(queryPairs).toString();
  return url.toString();
}

async function fetchApiResponse(url, headers) {
  let response;
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json, */*;q=0.8', ...headers },
      redirect: 'follow',
    });
  } catch (error) {
    throw new CliError(
      `Network request failed for ${new URL(url).pathname}: ${error.message}`
    );
  }
  const body = Buffer.from(await response.arrayBuffer());
  if (!response.ok) {
    throw new HttpError({
      url,
      status: response.status,
      detail: errorDetailFromBody(body.toString('utf8')),
      resource: 'Nx Cloud API request',
    });
  }
  const contentType =
    response.headers.get('content-type') ?? 'application/octet-stream';
  const text = body.toString('utf8');
  const looksLikeJson =
    contentType.toLowerCase().includes('json') || /^[\s\n\r]*[\[{]/.test(text);
  if (!looksLikeJson) return { body, contentType, json: null };
  return { body, contentType, json: parseJson(text, new URL(url).pathname) };
}

async function writePrivateFile(outputPath, contents) {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, contents, { mode: 0o600 });
  await chmod(outputPath, 0o600);
}

async function emitNdjsonPage(rows, outputPath, isFirstPage) {
  const text = rows.map((row) => JSON.stringify(row)).join('\n');
  const contents = text ? `${text}\n` : '';
  if (outputPath) {
    if (isFirstPage) await writePrivateFile(outputPath, contents);
    else if (contents) await appendFile(outputPath, contents);
  } else if (contents) {
    process.stdout.write(contents);
  }
}

async function emitJson(value, format, outputPath) {
  let text;
  if (format === 'ndjson') {
    const rows = Array.isArray(value) ? value : [value];
    text = rows.map((row) => JSON.stringify(row)).join('\n');
    if (text) text += '\n';
  } else {
    text = `${JSON.stringify(value, null, 2)}\n`;
  }
  if (outputPath) {
    await writePrivateFile(outputPath, text);
    process.stderr.write(`Wrote ${outputPath}\n`);
  } else {
    process.stdout.write(text);
  }
}

async function runRequest(context, spec, selection, options) {
  const plan = buildRequestPlan(spec, selection, options);
  const requestCloudUrl = selection.cloudUrl ?? context.cloudUrl;
  const firstUrl = requestUrl(requestCloudUrl, plan.path, plan.queryPairs);
  if (options.dryRun) {
    await emitJson(
      {
        method: 'GET',
        endpoint: plan.path,
        url: firstUrl,
        pages: plan.pages,
        authenticationChecked: false,
        serverValidationChecked: false,
      },
      'json',
      null
    );
    process.stderr.write(
      'Dry run passed formal OpenAPI validation. It did not call the endpoint or verify credentials and workspace access.\n'
    );
    return;
  }

  const authentication = await resolveAuthentication(
    options,
    { ...context, cloudUrl: requestCloudUrl },
    options.workspaceAccessToken
  );
  const headers = authentication.headers;
  const originalQueryPairs = [...plan.queryPairs];
  let currentQueryPairs = [...plan.queryPairs];
  let nextCursor = null;
  let pagesFetched = 0;
  let isCollection = null;
  let objectResponse = null;
  let fetchedItemCount = 0;
  const items = [];
  const streamingOutputPath =
    plan.format === 'ndjson' && plan.outputPath
      ? `${plan.outputPath}.partial`
      : null;

  for (let page = 1; page <= plan.pages; page += 1) {
    const url = requestUrl(requestCloudUrl, plan.path, currentQueryPairs);
    const response = await fetchApiResponse(url, headers);
    if (response.json === null) {
      if (page !== 1 || plan.pages !== 1) {
        throw new CliError('Binary asset requests support exactly one page.');
      }
      if (!plan.outputPath) {
        throw new CliError(
          `The API returned ${response.contentType}. Use --out <file> for binary data.`
        );
      }
      await writePrivateFile(plan.outputPath, response.body);
      process.stderr.write(
        `Wrote ${plan.outputPath} (${response.contentType})\n`
      );
      return;
    }

    pagesFetched += 1;
    if (Array.isArray(response.json.items)) {
      if (isCollection === false)
        throw new CliError(
          'The endpoint changed response shape during pagination.'
        );
      isCollection = true;
      fetchedItemCount += response.json.items.length;
      if (plan.format === 'ndjson') {
        await emitNdjsonPage(
          response.json.items,
          streamingOutputPath,
          page === 1
        );
      } else {
        items.push(...response.json.items);
      }
      nextCursor = response.json.nextCursor ?? null;
      process.stderr.write(
        `Fetched page ${page}: ${response.json.items.length} items\n`
      );
    } else {
      if (page !== 1)
        throw new CliError(
          'The endpoint does not return a paginated items collection.'
        );
      isCollection = false;
      objectResponse = response.json;
      nextCursor = null;
      process.stderr.write('Fetched one response object\n');
    }

    if (!nextCursor || page === plan.pages) break;
    if (!plan.cursorParameter) {
      throw new CliError(
        'The response returned nextCursor, but the live schema has no cursor query parameter.'
      );
    }
    currentQueryPairs = removeQueryKey(
      currentQueryPairs,
      plan.cursorParameter.name
    );
    if (plan.sortParameter)
      currentQueryPairs = removeQueryKey(
        currentQueryPairs,
        plan.sortParameter.name
      );
    currentQueryPairs.push([plan.cursorParameter.name, String(nextCursor)]);
  }

  const source = {
    cloudUrl: cloudUrlIdentity(requestCloudUrl),
    endpoint: plan.path,
    query: queryObject(originalQueryPairs),
  };
  if (isCollection) {
    const pageLimitReached = Boolean(nextCursor);
    if (pageLimitReached) {
      process.stderr.write(
        `Stopped after ${pagesFetched} page(s). More results are available; increase --pages or narrow the filters.\n`
      );
    }
    const metadata = {
      source,
      pagesFetched,
      fetchedItemCount,
      pageLimitReached,
      nextCursor,
    };
    if (plan.format === 'ndjson' && streamingOutputPath) {
      await rename(streamingOutputPath, plan.outputPath);
      process.stderr.write(`Wrote ${plan.outputPath}\n`);
    }
    if (plan.metadataOutputPath) {
      await emitJson(metadata, 'json', plan.metadataOutputPath);
    }
    if (plan.format === 'ndjson') {
      if (!plan.metadataOutputPath) {
        process.stderr.write(
          'NDJSON output omits pagination metadata. Use --metadata-out <file> to save the nextCursor and completion state.\n'
        );
      }
    } else {
      await emitJson({ ...metadata, items }, 'json', plan.outputPath);
    }
  } else {
    const result = { source, response: objectResponse };
    await emitJson(
      plan.format === 'ndjson' ? objectResponse : result,
      plan.format,
      plan.outputPath
    );
  }
}

function printCatalog(catalog) {
  process.stdout.write(`Nx Cloud: ${catalog.cloudUrl}\n`);
  process.stdout.write(`${catalog.title} / ${catalog.version}\n`);
  for (const operation of catalog.operations) {
    const summary = operation.summary ? ` — ${operation.summary}` : '';
    process.stdout.write(`${operation.method} ${operation.path}${summary}\n`);
  }
}

function printDescription(description) {
  process.stdout.write(`Nx Cloud: ${description.cloudUrl}\n`);
  process.stdout.write(`${description.method} ${description.path}\n`);
  if (description.summary) process.stdout.write(`${description.summary}\n`);
  if (description.description)
    process.stdout.write(
      `${description.description.replace(/\s+/g, ' ').trim()}\n`
    );
  process.stdout.write('Authentication alternatives:\n');
  if (description.security.length === 0)
    process.stdout.write('  None documented\n');
  for (const alternative of description.security) {
    process.stdout.write(
      `  ${alternative.map((scheme) => scheme.name).join(' + ')}\n`
    );
    for (const scheme of alternative) {
      if (scheme.description)
        process.stdout.write(
          `    ${scheme.description.replace(/\s+/g, ' ').trim()}\n`
        );
    }
  }
  process.stdout.write('Parameters:\n');
  if (description.parameters.length === 0) process.stdout.write('  None\n');
  for (const parameter of description.parameters) {
    const required = parameter.required ? ' required' : '';
    const enumValues = parameter.schema.enum
      ? ` [${parameter.schema.enum.join(', ')}]`
      : '';
    process.stdout.write(
      `  ${parameter.in} ${parameter.name}: ${parameter.schema.type}${enumValues}${required}\n`
    );
    if (parameter.style || parameter.explode !== null) {
      process.stdout.write(
        `    serialization: style=${parameter.style ?? 'default'}, explode=${
          parameter.explode ?? 'default'
        }\n`
      );
    }
    if (parameter.description)
      process.stdout.write(
        `    ${parameter.description.replace(/\s+/g, ' ').trim()}\n`
      );
  }
  const fields =
    description.response.properties?.join(', ') ?? 'none documented';
  const status = description.response.status ?? 'success';
  process.stdout.write(
    `${status} response: ${description.response.type}; fields: ${fields}\n`
  );
  if (description.response.description) {
    process.stdout.write(
      `  ${description.response.description.replace(/\s+/g, ' ').trim()}\n`
    );
  }
  if (description.response.item) {
    const itemFields =
      description.response.item.properties?.join(', ') ?? 'none documented';
    process.stdout.write(
      `  item: ${description.response.item.type}; fields: ${itemFields}\n`
    );
  }
  const otherResponses = description.responses.filter(
    (response) => response.status !== description.response.status
  );
  if (otherResponses.length > 0) {
    process.stdout.write('Other responses:\n');
    for (const response of otherResponses) {
      const detail = response.description
        ? ` ${response.description.replace(/\s+/g, ' ').trim()}`
        : '';
      process.stdout.write(`  ${response.status}:${detail}\n`);
    }
  }
}

async function main() {
  const { command, positionals, options } = parseArgs(process.argv.slice(2));
  if (command === 'help') {
    printHelp();
    return;
  }

  const workspaceAccessToken =
    command === 'request' ? await resolveWorkspaceAccessToken(options) : null;
  options.workspaceAccessToken = workspaceAccessToken;
  const suppliedSelector = positionals[0];
  const suppliedAbsoluteUrl =
    typeof suppliedSelector === 'string' &&
    /^https?:\/\//i.test(suppliedSelector)
      ? new URL(suppliedSelector)
      : null;
  const contextOptions = suppliedAbsoluteUrl
    ? { ...options, cloudUrl: suppliedAbsoluteUrl.origin }
    : options;
  const requireCloudId =
    command === 'request' && !options.dryRun && !workspaceAccessToken;
  const context = await resolveCloudContext(contextOptions, { requireCloudId });
  const spec = await loadOpenApi(options.spec, context.cloudUrl);

  if (command === 'catalog') {
    const catalog = {
      cloudUrl: cloudUrlIdentity(context.cloudUrl),
      title: spec.info?.title ?? 'Nx Cloud API',
      version: spec.info?.version ?? spec.openapi ?? 'unknown',
      openapi: spec.openapi ?? 'unknown',
      security: (spec.security ?? []).map((requirement) =>
        Object.keys(requirement)
      ),
      operations: listOperations(spec).map((entry) => ({
        method: entry.method,
        path: entry.path,
        summary: entry.operation.summary ?? '',
        parameters: parametersFor(spec, entry).map((parameter) => ({
          in: parameter.in,
          name: parameter.name,
          required: Boolean(parameter.required),
          style: parameter.style ?? null,
          explode: parameter.explode ?? null,
          schema: schemaSummary(spec, parameter.schema),
        })),
      })),
    };
    if (options.json) await emitJson(catalog, 'json', null);
    else printCatalog(catalog);
    return;
  }

  const selection = resolveSelector(spec, context.cloudUrl, positionals[0]);
  if (
    cloudUrlIdentity(selection.cloudUrl) !== cloudUrlIdentity(context.cloudUrl)
  ) {
    const linkedSpec = await loadOpenApi(options.spec, selection.cloudUrl);
    const linkedSelection = resolveSelector(
      linkedSpec,
      selection.cloudUrl,
      positionals[0]
    );
    if (command === 'describe') {
      const description = {
        cloudUrl: cloudUrlIdentity(selection.cloudUrl),
        ...describeOperation(linkedSpec, linkedSelection.entry),
      };
      if (options.json) await emitJson(description, 'json', null);
      else printDescription(description);
      return;
    }
    await runRequest(
      { ...context, cloudUrl: selection.cloudUrl },
      linkedSpec,
      linkedSelection,
      options
    );
    return;
  }
  if (command === 'describe') {
    const description = {
      cloudUrl: cloudUrlIdentity(context.cloudUrl),
      ...describeOperation(spec, selection.entry),
    };
    if (options.json) await emitJson(description, 'json', null);
    else printDescription(description);
    return;
  }

  await runRequest(context, spec, selection, options);
}

function recoverySteps(error) {
  if (error instanceof HttpError) {
    if (error.resource === 'OpenAPI document')
      return [
        'Confirm that nxCloudUrl or NX_CLOUD_URL identifies the intended Nx Cloud server.',
        'Confirm that this server supports the Nx Cloud API.',
        'Ask the server administrator for help if it blocks access to the OpenAPI document.',
      ];
    if (error.status === 401)
      return [
        'Run `nx login --status` from the workspace root to check the Nx Cloud login.',
        'Run `nx login` from the workspace root if the token expired or was revoked.',
        'Confirm that the Nx Cloud ID and personal access token belong to the same workspace.',
        'Set NX_CLOUD_PERSONAL_ACCESS_TOKEN securely only when you need an explicit override.',
      ];
    if (error.status === 403)
      return [
        'Confirm that the personal access token has access to this Nx Cloud workspace.',
        'Confirm that nxCloudId identifies the intended workspace.',
        'Ask a workspace administrator for access if the workspace is correct.',
      ];
    if (error.status === 404)
      return [
        'Run catalog to confirm that this Nx Cloud server provides the Nx Cloud API.',
        'Run describe for the endpoint before you request a resource.',
        'Confirm the Nx Cloud URL and the resource ID.',
      ];
    if (error.status === 409)
      return [
        'Read the live operation description to identify the non-terminal parent or workflow.',
        'Wait until that resource reaches a terminal state.',
        'Retry the same bounded request after completion.',
      ];
    if (error.status === 429)
      return [
        'Wait before you retry the request.',
        'Use a smaller page count and narrower filters on the next request.',
      ];
    if (error.status >= 500)
      return [
        'Retry the request after a short wait.',
        'Check the Nx Cloud service status if the error continues.',
        'Keep the endpoint, time range, and HTTP status for a support request.',
      ];
  }
  if (error.message.startsWith('Network request failed'))
    return [
      'Confirm that the Nx Cloud URL is reachable from this environment.',
      'Check the proxy, VPN, and network settings.',
      'Retry the request. Use --dry-run first if you changed the request.',
    ];
  if (error instanceof CliError) return error.nextSteps;
  return [
    'Run the command again with the same bounded filters.',
    'Run --help to confirm the command syntax if you changed the request.',
    'Preserve the error text, endpoint, and time range for support if the error continues.',
  ];
}

main().catch((error) => {
  const message =
    error instanceof CliError
      ? error.message
      : `Unexpected error: ${error.message}`;
  process.stderr.write(`Error: ${message}\n`);
  const steps = recoverySteps(error);
  if (steps.length > 0) {
    process.stderr.write('Next steps:\n');
    steps.forEach((step, index) =>
      process.stderr.write(`  ${index + 1}. ${step}\n`)
    );
  }
  process.exitCode = 1;
});
