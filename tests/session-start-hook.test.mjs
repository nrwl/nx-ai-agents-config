import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildSessionStartOutput } from '../plugins/shared/hooks/session-start.mjs';

describe('session-start hook', () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'nx-hook-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('injects the Nx guidelines from anywhere inside an Nx workspace', () => {
    writeFileSync(join(dir, 'nx.json'), '{}');
    mkdirSync(join(dir, 'libs', 'ui'), { recursive: true });

    expect(buildSessionStartOutput(join(dir, 'libs', 'ui'))).toEqual({
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: readFileSync(
          join(
            import.meta.dirname,
            '..',
            'plugins',
            'shared',
            'hooks',
            'nx-guidelines.md'
          ),
          'utf8'
        ),
      },
    });
  });

  it('stays silent outside Nx workspaces', () => {
    expect(buildSessionStartOutput(dir)).toBeNull();
  });
});
