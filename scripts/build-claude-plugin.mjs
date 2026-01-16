import { cpSync, rmSync, existsSync } from 'fs';
import { join } from 'path';

const rootDir = join(import.meta.dirname, '..');
const pluginDir = join(rootDir, 'nx-claude-plugin');

const foldersToCopy = ['agents', 'skills', 'commands'];

for (const folder of foldersToCopy) {
  const src = join(rootDir, 'artifacts', folder);
  const dest = join(pluginDir, folder);

  // Remove existing folder in destination if it exists
  if (existsSync(dest)) {
    rmSync(dest, { recursive: true });
  }

  // Copy folder if source exists
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true });
    console.log(`Copied ${folder}/ to nx-claude-plugin/${folder}/`);
  } else {
    console.log(`Skipped ${folder}/ (source does not exist)`);
  }
}

console.log('Build complete!');
