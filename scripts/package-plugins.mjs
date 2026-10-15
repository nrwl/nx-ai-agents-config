// Builds the publishable npm packages for each agent into dist/<agent>.
//
// The packages are assembled from the outputs `nx sync-artifacts` already
// generates (root skills/ and agents/ for Claude Code, generated/.agents for
// Codex, generated/.opencode for OpenCode) plus the agent-specific runtime
// code under plugins/. All packages share the version in
// .claude-plugin/plugin.json.

import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

export const rootDir = join(import.meta.dirname, '..');
const pluginsDir = join(rootDir, 'plugins');
const generatedDir = join(rootDir, 'generated');

export const PACKAGE_NAMES = {
  claude: '@nx/claude-plugin',
  codex: '@nx/codex-plugin',
  opencode: '@nx/opencode-plugin',
};

const KEYWORDS = ['nx', 'monorepo', 'ci', 'mcp', 'skills', 'ai'];
const HOMEPAGE = 'https://github.com/nrwl/nx-ai-agents-config#readme';

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, value) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function copy(from, to) {
  if (!existsSync(from)) {
    throw new Error(`Missing ${from}. Run \`npx nx sync-artifacts\` first.`);
  }
  cpSync(from, to, { recursive: true });
}

export function readPluginManifest() {
  return readJson(join(rootDir, '.claude-plugin', 'plugin.json'));
}

function readMcpServers() {
  return readJson(join(rootDir, '.mcp.json'));
}

function buildPackageJson(manifest, agent, files, extraFields = {}) {
  return {
    name: PACKAGE_NAMES[agent],
    version: manifest.version,
    description: manifest.description,
    license: manifest.license,
    author: manifest.author,
    homepage: HOMEPAGE,
    repository: {
      type: 'git',
      url: 'git+https://github.com/nrwl/nx-ai-agents-config.git',
    },
    keywords: KEYWORDS,
    publishConfig: { access: 'public' },
    files,
    ...extraFields,
  };
}

function writeReadme(dir, title, installLines) {
  const body = [
    `# ${title}`,
    '',
    'Nx skills, subagents and the Nx MCP server for AI coding agents.',
    'Generated from https://github.com/nrwl/nx-ai-agents-config.',
    '',
    '## Install',
    '',
    'Run `nx configure-ai-agents` in your Nx workspace. It registers this plugin for the workspace only.',
    '',
    ...installLines,
    '',
  ];
  writeFileSync(join(dir, 'README.md'), body.join('\n'));
}

function copySharedHook(targetDir) {
  const hooksDir = join(targetDir, 'hooks');
  mkdirSync(hooksDir, { recursive: true });
  copy(
    join(pluginsDir, 'shared', 'hooks', 'session-start.mjs'),
    join(hooksDir, 'session-start.mjs')
  );
  copy(
    join(pluginsDir, 'shared', 'hooks', 'nx-guidelines.md'),
    join(hooksDir, 'nx-guidelines.md')
  );
}

function copyLicense(targetDir) {
  copy(join(rootDir, 'LICENSE'), join(targetDir, 'LICENSE'));
}

export function buildClaude(distDir, manifest) {
  const dir = join(distDir, 'claude');
  copy(join(rootDir, 'skills'), join(dir, 'skills'));
  copy(join(rootDir, 'agents'), join(dir, 'agents'));
  copy(join(rootDir, '.mcp.json'), join(dir, '.mcp.json'));
  writeJson(join(dir, '.claude-plugin', 'plugin.json'), manifest);
  copySharedHook(dir);
  copy(
    join(pluginsDir, 'claude', 'hooks', 'hooks.json'),
    join(dir, 'hooks', 'hooks.json')
  );
  writeJson(
    join(dir, 'package.json'),
    buildPackageJson(manifest, 'claude', [
      '.claude-plugin/',
      'skills/',
      'agents/',
      'hooks/',
      '.mcp.json',
      'README.md',
      'LICENSE',
    ])
  );
  writeReadme(dir, 'Nx plugin for Claude Code', [
    'Claude Code installs it from the `nx-claude-plugins` marketplace in nrwl/nx-ai-agents-config.',
  ]);
  copyLicense(dir);
}

export function buildCodexManifest(manifest) {
  return {
    name: 'nx',
    version: manifest.version,
    description:
      'Make Codex an effective monorepo developer: navigate the Nx project graph, run generators that follow workspace conventions, and monitor CI until it is green.',
    author: manifest.author,
    homepage: HOMEPAGE,
    repository: manifest.repository,
    license: manifest.license,
    keywords: KEYWORDS,
    skills: './skills/',
    mcpServers: './.mcp.json',
    hooks: './hooks/hooks.json',
    interface: {
      displayName: 'Nx',
      shortDescription: 'Nx monorepo skills and the Nx MCP server.',
      developerName: manifest.author.name,
      category: 'Productivity',
      capabilities: ['Read', 'Write'],
      websiteURL: 'https://nx.dev',
    },
  };
}

export function buildCodex(distDir, manifest) {
  const dir = join(distDir, 'codex');
  copy(join(generatedDir, '.agents', 'skills'), join(dir, 'skills'));
  const mcpServers = {};
  for (const [name, server] of Object.entries(readMcpServers())) {
    mcpServers[name] = { command: server.command, args: server.args };
  }
  writeJson(join(dir, '.mcp.json'), { mcpServers });
  writeJson(
    join(dir, '.codex-plugin', 'plugin.json'),
    buildCodexManifest(manifest)
  );
  copySharedHook(dir);
  copy(
    join(pluginsDir, 'codex', 'hooks', 'hooks.json'),
    join(dir, 'hooks', 'hooks.json')
  );
  copy(join(pluginsDir, 'codex', 'bin'), join(dir, 'bin'));
  copy(join(pluginsDir, 'codex', 'lib'), join(dir, 'lib'));
  writeJson(
    join(dir, 'package.json'),
    buildPackageJson(
      manifest,
      'codex',
      [
        '.codex-plugin/',
        'skills/',
        'hooks/',
        'bin/',
        'lib/',
        '.mcp.json',
        'README.md',
        'LICENSE',
      ],
      {
        type: 'module',
        bin: { 'nx-codex-plugin': './bin/nx-codex-plugin.mjs' },
      }
    )
  );
  writeReadme(dir, 'Nx plugin for Codex', [
    'To cache the plugin in Codex yourself (it stays disabled until a workspace enables it):',
    '',
    '```sh',
    `npx @nx/codex-plugin@${manifest.version} install`,
    '```',
  ]);
  copyLicense(dir);
}

export function buildOpenCode(distDir, manifest) {
  const dir = join(distDir, 'opencode');
  const source = join(generatedDir, '.opencode');
  copy(join(source, 'skills'), join(dir, 'skills'));
  copy(join(source, 'agents'), join(dir, 'agents'));
  copy(join(source, 'commands'), join(dir, 'commands'));
  copy(join(pluginsDir, 'opencode', 'server.js'), join(dir, 'server.js'));
  copy(join(pluginsDir, 'opencode', 'lib'), join(dir, 'lib'));
  copy(
    join(pluginsDir, 'shared', 'hooks', 'nx-guidelines.md'),
    join(dir, 'nx-guidelines.md')
  );
  const rootPackageJson = readJson(join(rootDir, 'package.json'));
  writeJson(
    join(dir, 'package.json'),
    buildPackageJson(
      manifest,
      'opencode',
      [
        'server.js',
        'lib/',
        'skills/',
        'agents/',
        'commands/',
        'nx-guidelines.md',
        'README.md',
        'LICENSE',
      ],
      {
        type: 'module',
        main: './server.js',
        exports: { '.': './server.js' },
        dependencies: {
          'js-yaml': rootPackageJson.dependencies['js-yaml'],
        },
      }
    )
  );
  writeReadme(dir, 'Nx plugin for OpenCode', [
    'Or add it to the workspace `opencode.json` yourself:',
    '',
    '```json',
    `{ "plugin": ["@nx/opencode-plugin@${manifest.version}"] }`,
    '```',
  ]);
  copyLicense(dir);
}

export function packagePlugins(distDir = join(rootDir, 'dist')) {
  const manifest = readPluginManifest();
  rmSync(distDir, { recursive: true, force: true });
  buildClaude(distDir, manifest);
  buildCodex(distDir, manifest);
  buildOpenCode(distDir, manifest);
  return { distDir, version: manifest.version };
}

const isMainModule =
  process.argv[1] &&
  import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMainModule) {
  const { distDir, version } = packagePlugins();
  console.log(
    `Packaged ${Object.values(PACKAGE_NAMES).join(
      ', '
    )} ${version} into ${distDir}`
  );
}
