import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

const SCRIPT = resolve(
  import.meta.dirname,
  '../../artifacts/skills/monitor-ci/scripts/ci-state-update.mjs'
);

function runScript(args) {
  return new Promise((resolve, reject) => {
    execFile('node', [SCRIPT, ...args], (err, stdout, stderr) => {
      if (err) return reject(new Error(`${err.message}\n${stderr}`));
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error(`Failed to parse JSON: ${stdout}`));
      }
    });
  });
}

// ─── gate command ───

describe('gate', () => {
  describe('local-fix', () => {
    it('allows when count < max (default max=3)', async () => {
      const result = await runScript([
        'gate',
        '--gate-type',
        'local-fix',
        '--local-verify-count',
        '1',
      ]);
      expect(result.allowed).toBe(true);
      expect(result.localVerifyCount).toBe(2);
      expect(result.message).toBeNull();
    });

    it('blocks when count >= max (default max=3)', async () => {
      const result = await runScript([
        'gate',
        '--gate-type',
        'local-fix',
        '--local-verify-count',
        '3',
      ]);
      expect(result.allowed).toBe(false);
      expect(result.localVerifyCount).toBe(3);
      expect(result.message).toContain('3/3');
    });

    it('respects custom max via --local-verify-attempts', async () => {
      const result = await runScript([
        'gate',
        '--gate-type',
        'local-fix',
        '--local-verify-count',
        '4',
        '--local-verify-attempts',
        '5',
      ]);
      expect(result.allowed).toBe(true);
      expect(result.localVerifyCount).toBe(5);
    });

    it('blocks at custom max', async () => {
      const result = await runScript([
        'gate',
        '--gate-type',
        'local-fix',
        '--local-verify-count',
        '5',
        '--local-verify-attempts',
        '5',
      ]);
      expect(result.allowed).toBe(false);
    });

    it('defaults count to 0 when not provided', async () => {
      const result = await runScript(['gate', '--gate-type', 'local-fix']);
      expect(result.allowed).toBe(true);
      expect(result.localVerifyCount).toBe(1);
    });
  });

  describe('env-rerun', () => {
    it('allows when count < 2', async () => {
      const result = await runScript([
        'gate',
        '--gate-type',
        'env-rerun',
        '--env-rerun-count',
        '1',
      ]);
      expect(result.allowed).toBe(true);
      expect(result.envRerunCount).toBe(2);
    });

    it('blocks when count >= 2', async () => {
      const result = await runScript([
        'gate',
        '--gate-type',
        'env-rerun',
        '--env-rerun-count',
        '2',
      ]);
      expect(result.allowed).toBe(false);
      expect(result.envRerunCount).toBe(2);
      expect(result.message).toContain('2 reruns');
    });

    it('defaults count to 0 when not provided', async () => {
      const result = await runScript(['gate', '--gate-type', 'env-rerun']);
      expect(result.allowed).toBe(true);
      expect(result.envRerunCount).toBe(1);
    });
  });

  it('returns error for unknown gate type', async () => {
    const result = await runScript(['gate', '--gate-type', 'unknown']);
    expect(result.allowed).toBe(false);
    expect(result.message).toContain('Unknown gate type');
  });
});

// ─── post-action command ───

describe('post-action', () => {
  describe('cipeUrl actions', () => {
    for (const action of ['fix-auto-applying', 'apply-mcp', 'env-rerun']) {
      it(`${action}: sets waitMode, lastCipeUrl`, async () => {
        const result = await runScript([
          'post-action',
          '--action',
          action,
          '--cipe-url',
          'https://example.com/cipe/1',
        ]);
        expect(result.waitMode).toBe(true);
        expect(result.pollCount).toBe(0);
        expect(result.lastCipeUrl).toBe('https://example.com/cipe/1');
        expect(result.expectedCommitSha).toBeNull();
      });
    }

    it('fix-auto-applying: agentTriggered is false', async () => {
      const result = await runScript([
        'post-action',
        '--action',
        'fix-auto-applying',
        '--cipe-url',
        'url',
      ]);
      expect(result.agentTriggered).toBe(false);
    });

    it('apply-mcp: agentTriggered is true', async () => {
      const result = await runScript([
        'post-action',
        '--action',
        'apply-mcp',
        '--cipe-url',
        'url',
      ]);
      expect(result.agentTriggered).toBe(true);
    });

    it('env-rerun: agentTriggered is true', async () => {
      const result = await runScript([
        'post-action',
        '--action',
        'env-rerun',
        '--cipe-url',
        'url',
      ]);
      expect(result.agentTriggered).toBe(true);
    });
  });

  describe('commitSha actions', () => {
    const commitShaActions = [
      'apply-local-push',
      'reject-fix-push',
      'local-fix-push',
      'auto-fix-push',
      'empty-commit-push',
    ];

    for (const action of commitShaActions) {
      it(`${action}: sets waitMode, expectedCommitSha`, async () => {
        const result = await runScript([
          'post-action',
          '--action',
          action,
          '--commit-sha',
          'abc123',
        ]);
        expect(result.waitMode).toBe(true);
        expect(result.pollCount).toBe(0);
        expect(result.expectedCommitSha).toBe('abc123');
        expect(result.lastCipeUrl).toBeNull();
        expect(result.agentTriggered).toBe(true);
      });
    }
  });

  it('returns error for unknown action', async () => {
    const result = await runScript([
      'post-action',
      '--action',
      'unknown-action',
    ]);
    expect(result.error).toContain('Unknown action');
  });
});

// ─── cycle-check command ───

describe('cycle-check', () => {
  it('increments cycleCount when agent-triggered', async () => {
    const result = await runScript([
      'cycle-check',
      '--code',
      'fix_apply_ready',
      '--agent-triggered',
      '--cycle-count',
      '3',
    ]);
    expect(result.cycleCount).toBe(4);
    expect(result.agentTriggered).toBe(false);
  });

  it('does not increment cycleCount when not agent-triggered', async () => {
    const result = await runScript([
      'cycle-check',
      '--code',
      'fix_apply_ready',
      '--cycle-count',
      '3',
    ]);
    expect(result.cycleCount).toBe(3);
  });

  it('resets envRerunCount on non-environment status', async () => {
    const result = await runScript([
      'cycle-check',
      '--code',
      'fix_apply_ready',
      '--env-rerun-count',
      '2',
    ]);
    expect(result.envRerunCount).toBe(0);
  });

  it('preserves envRerunCount on environment_issue status', async () => {
    const result = await runScript([
      'cycle-check',
      '--code',
      'environment_issue',
      '--env-rerun-count',
      '1',
    ]);
    expect(result.envRerunCount).toBe(1);
  });

  it('detects approaching limit', async () => {
    const result = await runScript([
      'cycle-check',
      '--code',
      'fix_apply_ready',
      '--agent-triggered',
      '--cycle-count',
      '7',
      '--max-cycles',
      '10',
    ]);
    expect(result.cycleCount).toBe(8);
    expect(result.approachingLimit).toBe(true);
    expect(result.message).toContain('8/10');
  });

  it('not approaching limit when far from max', async () => {
    const result = await runScript([
      'cycle-check',
      '--code',
      'fix_apply_ready',
      '--cycle-count',
      '2',
      '--max-cycles',
      '10',
    ]);
    expect(result.approachingLimit).toBe(false);
    expect(result.message).toBeNull();
  });
});

// ─── unknown command ───

describe('unknown command', () => {
  it('returns error for unknown command', async () => {
    const result = await runScript(['bogus']);
    expect(result.error).toContain('Unknown command');
  });
});
