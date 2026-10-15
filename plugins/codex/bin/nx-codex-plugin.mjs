#!/usr/bin/env node

import {
  checkInstall,
  getPackageRootFromMetaUrl,
  installPlugin,
} from '../lib/installer.mjs';

const usage = `Usage:
  npx @nx/codex-plugin install [--json]
  npx @nx/codex-plugin check [--json]

install caches the Nx plugin in Codex without enabling it globally. Workspaces
enable it in their own .codex/config.toml, which \`nx configure-ai-agents\`
writes:

  [plugins."nx@nx-agent-plugins"]
  enabled = true

check reports whether this version of the plugin is cached.`;

function main() {
  let command = 'install';
  let json = false;

  for (const arg of process.argv.slice(2)) {
    if (arg === '--json') {
      json = true;
    } else if (arg === 'install' || arg === 'check') {
      command = arg;
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage);
      return;
    } else {
      throw new Error(`Unknown argument: ${arg}\n\n${usage}`);
    }
  }

  const packageRoot = getPackageRootFromMetaUrl(import.meta.url);
  const result =
    command === 'check'
      ? checkInstall({ packageRoot, env: process.env })
      : installPlugin({ packageRoot, env: process.env });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'check') {
    console.log(
      result.ok
        ? `Nx Codex plugin ${result.version} is cached at ${result.cachePath}.`
        : `Nx Codex plugin ${result.version} is not cached. Run: npx @nx/codex-plugin@${result.version} install`
    );
  } else if (result.ok) {
    console.log(
      `Cached Nx Codex plugin ${result.version} (${result.pluginId}).`
    );
    console.log(
      'It is enabled only in workspaces whose .codex/config.toml enables it.'
    );
  } else {
    console.error(result.error);
  }

  if (!result.ok) {
    process.exitCode = 1;
  }
}

try {
  main();
} catch (error) {
  console.error(
    `nx-codex-plugin failed: ${error instanceof Error ? error.message : error}`
  );
  process.exitCode = 1;
}
