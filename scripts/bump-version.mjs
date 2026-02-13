import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const rootDir = join(import.meta.dirname, '..');
const pluginJsonPath = join(rootDir, '.claude-plugin/plugin.json');
const cursorPluginJsonPath = join(rootDir, '.cursor-plugin/plugin.json');

// Parse --version argument
const versionArg = process.argv.find((arg) => arg.startsWith('--version'));
const versionFlag = process.argv.indexOf('--version');
const version =
  versionArg && versionArg.includes('=')
    ? versionArg.split('=')[1]
    : versionFlag !== -1
    ? process.argv[versionFlag + 1]
    : null;

if (!version) {
  console.error('Usage: node scripts/bump-version.mjs --version <semver>');
  process.exit(1);
}

// Validate semver (with optional pre-release suffix)
const semverRegex =
  /^\d+\.\d+\.\d+(-[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?(\+[a-zA-Z0-9]+(\.[a-zA-Z0-9]+)*)?$/;
if (!semverRegex.test(version)) {
  console.error(`Invalid semver version: ${version}`);
  process.exit(1);
}

// Update plugin.json files
for (const path of [pluginJsonPath, cursorPluginJsonPath]) {
  const pluginJson = JSON.parse(readFileSync(path, 'utf-8'));
  pluginJson.version = version;
  writeFileSync(path, JSON.stringify(pluginJson, null, 2) + '\n');
  console.log(`Updated ${path} → ${version}`);
}

console.log(`\nVersion bumped to ${version}`);
