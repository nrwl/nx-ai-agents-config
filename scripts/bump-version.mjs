import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const rootDir = join(import.meta.dirname, '..');
const pluginJsonPath = join(
  rootDir,
  'artifacts/claude-config/.claude-plugin/plugin.json'
);
const marketplaceJsonPath = join(rootDir, '.claude-plugin/marketplace.json');

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

// Update plugin.json (source of truth)
const pluginJson = JSON.parse(readFileSync(pluginJsonPath, 'utf-8'));
pluginJson.version = version;
writeFileSync(pluginJsonPath, JSON.stringify(pluginJson, null, 2) + '\n');
console.log(`Updated ${pluginJsonPath} → ${version}`);

// Update marketplace.json (plugins[0].version)
const marketplaceJson = JSON.parse(readFileSync(marketplaceJsonPath, 'utf-8'));
marketplaceJson.plugins[0].version = version;
writeFileSync(
  marketplaceJsonPath,
  JSON.stringify(marketplaceJson, null, 2) + '\n'
);
console.log(`Updated ${marketplaceJsonPath} → ${version}`);

console.log(`\nVersion bumped to ${version}`);
