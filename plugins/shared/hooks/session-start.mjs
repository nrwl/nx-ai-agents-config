#!/usr/bin/env node

// SessionStart hook for the Claude Code and Codex plugins. Both harnesses
// inject `hookSpecificOutput.additionalContext` from stdout into the model
// context, which is how the Nx guidelines reach the agent without the plugin
// writing to the workspace's AGENTS.md or CLAUDE.md.
//
// Only Nx workspaces get the guidelines: the plugin is enabled per project,
// but a user may also have enabled it globally.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const guidelinesPath = join(
  dirname(fileURLToPath(import.meta.url)),
  'nx-guidelines.md'
);

export function findNxWorkspaceRoot(startDir) {
  let dir = resolve(startDir);
  while (true) {
    if (existsSync(join(dir, 'nx.json'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return null;
    }
    dir = parent;
  }
}

export function buildSessionStartOutput(cwd) {
  if (!findNxWorkspaceRoot(cwd)) {
    return null;
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: readFileSync(guidelinesPath, 'utf8'),
    },
  };
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function main() {
  let cwd = process.cwd();
  try {
    const input = JSON.parse(readStdin() || '{}');
    if (typeof input.cwd === 'string' && input.cwd) {
      cwd = input.cwd;
    }
  } catch {
    // Malformed hook input: fall back to the process cwd.
  }

  const result = buildSessionStartOutput(cwd);
  if (result) {
    process.stdout.write(JSON.stringify(result));
  }
}

const isMainModule =
  process.argv[1] &&
  realpathSync(process.argv[1]) ===
    realpathSync(fileURLToPath(import.meta.url));
if (isMainModule) {
  try {
    main();
  } catch {
    // A failing hook must never break the agent session.
  }
}
