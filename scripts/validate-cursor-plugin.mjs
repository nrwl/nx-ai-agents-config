import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

const VALIDATE_SCRIPT_URL =
  'https://raw.githubusercontent.com/cursor/plugin-template/main/scripts/validate-template.mjs';

const tmpDir = mkdtempSync(join(tmpdir(), 'cursor-plugin-validate-'));
const scriptPath = join(tmpDir, 'validate-template.mjs');

try {
  console.log('Fetching Cursor plugin validation script...');
  const response = await fetch(VALIDATE_SCRIPT_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch validation script: ${response.status}`);
  }
  const script = await response.text();
  writeFileSync(scriptPath, script);

  console.log('Running validation...\n');
  execSync(`node ${scriptPath}`, {
    cwd: join(import.meta.dirname, '..'),
    stdio: 'inherit',
  });
} finally {
  rmSync(tmpDir, { recursive: true, force: true });
}
