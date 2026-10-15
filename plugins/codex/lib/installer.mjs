import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_NAME = 'nx';
export const MARKETPLACE_NAME = 'nx-agent-plugins';
export const PLUGIN_ID = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;
const MARKETPLACE_DISPLAY_NAME = 'Nx Agent Plugins';

export function getPackageRootFromMetaUrl(metaUrl) {
  return resolve(dirname(fileURLToPath(metaUrl)), '..');
}

export function resolveUserHome(env = process.env) {
  const userHome = env.HOME?.trim() || homedir();
  return resolve(expandHome(userHome, env));
}

export function resolveCodexHome(env = process.env) {
  const configuredHome = env.CODEX_HOME?.trim();
  if (configuredHome) {
    return resolve(expandHome(configuredHome, env));
  }
  return join(resolveUserHome(env), '.codex');
}

/**
 * Root of the marketplace Nx owns outright. The shared
 * ~/.agents/plugins/marketplace.json may belong to another tool, and Codex
 * derives plugin ids from the marketplace name, so publishing there could
 * rename this plugin.
 */
export function getMarketplaceRoot(userHome) {
  return join(userHome, '.nx', 'codex-marketplace');
}

export function getMarketplacePath(marketplaceRoot) {
  return join(marketplaceRoot, '.agents', 'plugins', 'marketplace.json');
}

export function getPluginInstallPath(marketplaceRoot) {
  return join(marketplaceRoot, 'plugins', PLUGIN_NAME);
}

export function getCodexCachePath(codexHome, version) {
  return join(
    codexHome,
    'plugins',
    'cache',
    MARKETPLACE_NAME,
    PLUGIN_NAME,
    version
  );
}

export function loadPackageMetadata(packageRoot) {
  const packageJsonPath = join(packageRoot, 'package.json');
  const pluginManifestPath = join(packageRoot, '.codex-plugin', 'plugin.json');

  if (!existsSync(packageJsonPath)) {
    throw new Error(`Missing package.json at ${packageJsonPath}`);
  }
  if (!existsSync(pluginManifestPath)) {
    throw new Error(`Missing Codex plugin manifest at ${pluginManifestPath}`);
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const pluginManifest = JSON.parse(readFileSync(pluginManifestPath, 'utf8'));

  if (pluginManifest.name !== PLUGIN_NAME) {
    throw new Error(
      `Expected .codex-plugin/plugin.json name to be "${PLUGIN_NAME}", received "${pluginManifest.name}"`
    );
  }
  if (!packageJson.version) {
    throw new Error(`Missing package version in ${packageJsonPath}`);
  }
  if (
    pluginManifest.version &&
    pluginManifest.version !== packageJson.version
  ) {
    throw new Error(
      `Package version mismatch: package.json has "${packageJson.version}" but the plugin manifest has "${pluginManifest.version}"`
    );
  }

  return { packageJson, version: packageJson.version };
}

export function runCodex(args, env = process.env) {
  const result = spawnSync('codex', args, { encoding: 'utf8', env });
  if (result.error) {
    return { ok: false, missing: true, error: result.error.message };
  }
  if (result.status !== 0) {
    return {
      ok: false,
      missing: false,
      error: (result.stderr || result.stdout || '').trim(),
    };
  }
  return { ok: true };
}

/**
 * Make the plugin available to Codex without enabling it everywhere.
 *
 *  1. Copies the package payload into the marketplace Nx owns and writes its
 *     manifest.
 *  2. Registers that marketplace and installs the plugin with the Codex CLI,
 *     which caches it under $CODEX_HOME/plugins/cache.
 *  3. Removes the user-level `[plugins."nx@nx-agent-plugins"]` table that
 *     `codex plugin add` writes. A cached plugin with no user-level entry is
 *     only active in trusted projects whose `.codex/config.toml` enables it,
 *     which is what `nx configure-ai-agents` writes.
 */
export function installPlugin({
  packageRoot,
  env = process.env,
  codex = runCodex,
} = {}) {
  if (!packageRoot) {
    throw new Error('packageRoot is required');
  }

  const { packageJson, version } = loadPackageMetadata(packageRoot);
  const userHome = resolveUserHome(env);
  const codexHome = resolveCodexHome(env);
  const marketplaceRoot = getMarketplaceRoot(userHome);
  const pluginPath = getPluginInstallPath(marketplaceRoot);

  rmSync(pluginPath, { recursive: true, force: true });
  mkdirSync(pluginPath, { recursive: true });
  for (const relativePath of getPackagePayloadPaths(packageRoot, packageJson)) {
    const sourcePath = join(packageRoot, relativePath);
    if (existsSync(sourcePath)) {
      cpSync(sourcePath, join(pluginPath, relativePath), { recursive: true });
    }
  }
  writeMarketplaceManifest({ marketplaceRoot, pluginPath });

  const base = {
    pluginId: PLUGIN_ID,
    version,
    marketplaceRoot,
    codexHome,
  };

  const marketplace = codex(
    ['plugin', 'marketplace', 'add', marketplaceRoot],
    env
  );
  if (!marketplace.ok) {
    return {
      ...base,
      ok: false,
      codexAvailable: !marketplace.missing,
      error: marketplace.missing
        ? `Codex CLI not found: ${marketplace.error}`
        : `codex plugin marketplace add failed: ${marketplace.error}`,
    };
  }

  const add = codex(['plugin', 'add', PLUGIN_ID], env);
  if (!add.ok) {
    return {
      ...base,
      ok: false,
      codexAvailable: true,
      error: `codex plugin add failed: ${add.error}`,
    };
  }

  const userEntryRemoved = removeUserPluginEntry(codexHome);

  return { ...base, ok: true, codexAvailable: true, userEntryRemoved };
}

export function checkInstall({ packageRoot, env = process.env } = {}) {
  const { version } = loadPackageMetadata(packageRoot);
  const codexHome = resolveCodexHome(env);
  const cachePath = getCodexCachePath(codexHome, version);
  const cached = existsSync(join(cachePath, '.codex-plugin', 'plugin.json'));
  return {
    ok: cached,
    pluginId: PLUGIN_ID,
    version,
    codexHome,
    cachePath,
  };
}

export function writeMarketplaceManifest({ marketplaceRoot, pluginPath }) {
  const manifest = {
    name: MARKETPLACE_NAME,
    interface: { displayName: MARKETPLACE_DISPLAY_NAME },
    plugins: [
      {
        name: PLUGIN_NAME,
        source: {
          source: 'local',
          path: toMarketplaceSourcePath(marketplaceRoot, pluginPath),
        },
        policy: {
          installation: 'AVAILABLE',
          authentication: 'ON_INSTALL',
        },
        category: 'Productivity',
      },
    ],
  };
  const marketplacePath = getMarketplacePath(marketplaceRoot);
  mkdirSync(dirname(marketplacePath), { recursive: true });
  writeFileSync(marketplacePath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/**
 * Remove the `[plugins."nx@nx-agent-plugins"]` table (and any of its
 * subtables) from $CODEX_HOME/config.toml. Edits the text line by line so the
 * user's comments and formatting elsewhere in the file survive.
 */
export function removeUserPluginEntry(codexHome) {
  const configPath = join(codexHome, 'config.toml');
  if (!existsSync(configPath)) {
    return false;
  }
  const original = readFileSync(configPath, 'utf8');
  const updated = removeTomlTable(original, `plugins."${PLUGIN_ID}"`);
  if (updated === original) {
    return false;
  }
  writeFileSync(configPath, updated);
  return true;
}

export function removeTomlTable(text, tableKey) {
  const lines = text.split('\n');
  const kept = [];
  let skipping = false;

  for (const line of lines) {
    const header = line.match(/^\s*\[\[?\s*([^\]]+?)\s*\]\]?\s*(#.*)?$/);
    if (header) {
      const key = header[1];
      skipping = key === tableKey || key.startsWith(`${tableKey}.`);
      if (skipping) {
        continue;
      }
    }
    if (!skipping) {
      kept.push(line);
    }
  }

  return kept
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\n+/, '');
}

function getPackagePayloadPaths(packageRoot, packageJson) {
  const relativePaths = new Set(packageJson.files ?? []);
  relativePaths.add('package.json');
  for (const extraFile of ['README.md', 'LICENSE']) {
    if (existsSync(join(packageRoot, extraFile))) {
      relativePaths.add(extraFile);
    }
  }
  return [...relativePaths];
}

function toMarketplaceSourcePath(marketplaceRoot, targetPath) {
  const relativePath = relative(marketplaceRoot, targetPath);
  if (
    !relativePath ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`)
  ) {
    throw new Error(
      `Expected plugin path ${targetPath} to be inside ${marketplaceRoot}`
    );
  }
  return `./${relativePath.split(sep).join('/')}`;
}

function expandHome(inputPath, env) {
  if (!inputPath.startsWith('~')) {
    return inputPath;
  }
  const userHome = env.HOME?.trim() || homedir();
  if (inputPath === '~') {
    return userHome;
  }
  if (inputPath.startsWith('~/')) {
    return join(userHome, inputPath.slice(2));
  }
  return inputPath;
}
