import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';

const SCRIPT = resolve(
  import.meta.dirname,
  '../../artifacts/skills/monitor-ci/scripts/ci-poll-decide.mjs'
);

function runScript(ciInfo, pollCount = 0, verbosity = 'medium', flags = []) {
  const args = [
    SCRIPT,
    JSON.stringify(ciInfo),
    String(pollCount),
    verbosity,
    ...flags,
  ];
  return new Promise((resolve, reject) => {
    execFile('node', args, (err, stdout, stderr) => {
      if (err) return reject(new Error(`${err.message}\n${stderr}`));
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch {
        reject(new Error(`Failed to parse JSON: ${stdout}`));
      }
    });
  });
}

// helper to build minimal ciInfo
function ci(overrides = {}) {
  return {
    cipeStatus: 'FAILED',
    selfHealingStatus: null,
    verificationStatus: null,
    selfHealingEnabled: true,
    selfHealingSkippedReason: null,
    failureClassification: null,
    failedTaskIds: [],
    verifiedTaskIds: [],
    couldAutoApplyTasks: false,
    autoApplySkipped: null,
    autoApplySkipReason: null,
    userAction: null,
    cipeUrl: 'https://ci.example.com/cipe/1',
    commitSha: 'sha1',
    ...overrides,
  };
}

// ─── Wait mode ───

describe('wait mode', () => {
  it('new_cipe_detected when prevCipeUrl differs', async () => {
    const result = await runScript(ci({ cipeUrl: 'url-new' }), 0, 'medium', [
      '--wait-mode',
      '--prev-cipe-url',
      'url-old',
    ]);
    expect(result.code).toBe('new_cipe_detected');
    expect(result.action).toBe('poll');
    expect(result.newCipeDetected).toBe(true);
    expect(result.delay).toBe(60);
  });

  it('new_cipe_detected when expectedSha matches commitSha', async () => {
    const result = await runScript(ci({ commitSha: 'abc' }), 0, 'medium', [
      '--wait-mode',
      '--expected-sha',
      'abc',
    ]);
    expect(result.code).toBe('new_cipe_detected');
  });

  it('no_new_cipe when wait timed out', async () => {
    const result = await runScript(ci(), 10, 'medium', [
      '--wait-mode',
      '--new-cipe-timeout',
      '100',
    ]);
    // 10 * 30 = 300 >= 100
    expect(result.code).toBe('no_new_cipe');
    expect(result.action).toBe('done');
  });

  it('waiting_for_cipe when still waiting', async () => {
    const result = await runScript(ci(), 0, 'medium', [
      '--wait-mode',
      '--new-cipe-timeout',
      '600',
    ]);
    expect(result.code).toBe('waiting_for_cipe');
    expect(result.action).toBe('wait');
    expect(result.delay).toBe(30);
  });
});

// ─── Guards ───

describe('guards', () => {
  it('polling_timeout when elapsed exceeds timeout', async () => {
    // pollCount=10, backoff(5)=120, 10*120=1200 >= 100
    const result = await runScript(ci(), 10, 'medium', ['--timeout', '100']);
    expect(result.code).toBe('polling_timeout');
    expect(result.action).toBe('done');
  });

  it('circuit_breaker when noProgressCount >= 5', async () => {
    // noProgressCount starts at inputNoProgressCount+1 when no state change
    const result = await runScript(ci(), 0, 'medium', [
      '--no-progress-count',
      '4',
    ]);
    // 4+1=5 >= 5
    expect(result.code).toBe('circuit_breaker');
    expect(result.action).toBe('done');
  });
});

// ─── Terminal CI states ───

describe('terminal CI states', () => {
  it('ci_success', async () => {
    const result = await runScript(ci({ cipeStatus: 'SUCCEEDED' }));
    expect(result.code).toBe('ci_success');
    expect(result.action).toBe('done');
    expect(result.noProgressCount).toBe(0); // in resetProgressCodes
  });

  it('cipe_canceled', async () => {
    const result = await runScript(ci({ cipeStatus: 'CANCELED' }));
    expect(result.code).toBe('cipe_canceled');
    expect(result.action).toBe('done');
  });

  it('cipe_timed_out', async () => {
    const result = await runScript(ci({ cipeStatus: 'TIMED_OUT' }));
    expect(result.code).toBe('cipe_timed_out');
    expect(result.action).toBe('done');
  });

  it('cipe_no_tasks when FAILED with no tasks and no SH', async () => {
    const result = await runScript(
      ci({ cipeStatus: 'FAILED', failedTaskIds: [], selfHealingStatus: null })
    );
    expect(result.code).toBe('cipe_no_tasks');
    expect(result.action).toBe('done');
  });
});

// ─── Environment ───

describe('environment', () => {
  it('environment_issue when classification is ENVIRONMENT_STATE', async () => {
    const result = await runScript(
      ci({
        failureClassification: 'environment_state',
        failedTaskIds: ['proj:build'],
      })
    );
    expect(result.code).toBe('environment_issue');
    expect(result.action).toBe('done');
  });

  it('environment_rerun_cap when envRerunCount >= 2', async () => {
    const result = await runScript(
      ci({
        failureClassification: 'environment_state',
        failedTaskIds: ['proj:build'],
      }),
      0,
      'medium',
      ['--env-rerun-count', '2']
    );
    expect(result.code).toBe('environment_rerun_cap');
    expect(result.action).toBe('done');
  });
});

// ─── Throttled ───

describe('throttled', () => {
  it('self_healing_throttled', async () => {
    const result = await runScript(
      ci({
        selfHealingSkippedReason: 'THROTTLED',
        failedTaskIds: ['proj:build'],
      })
    );
    expect(result.code).toBe('self_healing_throttled');
    expect(result.action).toBe('done');
  });
});

// ─── Running / polling states ───

describe('running states', () => {
  it('ci_running when IN_PROGRESS', async () => {
    const result = await runScript(ci({ cipeStatus: 'IN_PROGRESS' }));
    expect(result.code).toBe('ci_running');
    expect(result.action).toBe('poll');
    expect(result.fields).toBe('light');
  });

  it('ci_running when NOT_STARTED', async () => {
    const result = await runScript(ci({ cipeStatus: 'NOT_STARTED' }));
    expect(result.code).toBe('ci_running');
    expect(result.action).toBe('poll');
  });

  it('sh_running when self-healing in progress', async () => {
    const result = await runScript(ci({ selfHealingStatus: 'IN_PROGRESS' }));
    expect(result.code).toBe('sh_running');
    expect(result.action).toBe('poll');
  });

  it('flaky_rerun when classification is FLAKY_TASK', async () => {
    const result = await runScript(
      ci({ failureClassification: 'flaky_task', failedTaskIds: ['proj:build'] })
    );
    expect(result.code).toBe('flaky_rerun');
    expect(result.action).toBe('poll');
  });

  it('fix_auto_applied when userAction is APPLIED_AUTOMATICALLY', async () => {
    const result = await runScript(
      ci({ userAction: 'APPLIED_AUTOMATICALLY', failedTaskIds: ['proj:build'] })
    );
    expect(result.code).toBe('fix_auto_applied');
    expect(result.action).toBe('poll');
  });

  it('verification_pending when couldAutoApply and verification NOT_STARTED', async () => {
    const result = await runScript(
      ci({
        couldAutoApplyTasks: true,
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'NOT_STARTED',
      })
    );
    expect(result.code).toBe('verification_pending');
    expect(result.action).toBe('poll');
  });

  it('verification_pending when couldAutoApply and verification IN_PROGRESS', async () => {
    const result = await runScript(
      ci({
        couldAutoApplyTasks: true,
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'IN_PROGRESS',
      })
    );
    expect(result.code).toBe('verification_pending');
  });
});

// ─── Actionable done states ───

describe('actionable done states', () => {
  it('fix_auto_applying when couldAutoApply and verification COMPLETED', async () => {
    const result = await runScript(
      ci({
        couldAutoApplyTasks: true,
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'COMPLETED',
      })
    );
    expect(result.code).toBe('fix_auto_applying');
    expect(result.action).toBe('done');
    expect(result.noProgressCount).toBe(0); // in resetProgressCodes
  });

  it('fix_auto_apply_skipped when couldAutoApply but autoApplySkipped with COMPLETED verification', async () => {
    const result = await runScript(
      ci({
        couldAutoApplyTasks: true,
        autoApplySkipped: true,
        autoApplySkipReason: 'The previous CI pipeline execution was triggered by Nx Cloud',
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'COMPLETED',
      })
    );
    expect(result.code).toBe('fix_auto_apply_skipped');
    expect(result.action).toBe('done');
    expect(result.noProgressCount).toBe(0);
  });

  it('fix_auto_apply_skipped when couldAutoApply but autoApplySkipped with IN_PROGRESS verification', async () => {
    const result = await runScript(
      ci({
        couldAutoApplyTasks: true,
        autoApplySkipped: true,
        autoApplySkipReason: 'The previous CI pipeline execution was triggered by Nx Cloud',
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'IN_PROGRESS',
      })
    );
    expect(result.code).toBe('fix_auto_apply_skipped');
    expect(result.action).toBe('done');
  });

  it('fix_auto_applying unchanged when couldAutoApply and autoApplySkipped is false', async () => {
    const result = await runScript(
      ci({
        couldAutoApplyTasks: true,
        autoApplySkipped: false,
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'COMPLETED',
      })
    );
    expect(result.code).toBe('fix_auto_applying');
    expect(result.action).toBe('done');
  });

  it('verification_pending unchanged when couldAutoApply and autoApplySkipped is null', async () => {
    const result = await runScript(
      ci({
        couldAutoApplyTasks: true,
        autoApplySkipped: null,
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'IN_PROGRESS',
      })
    );
    expect(result.code).toBe('verification_pending');
    expect(result.action).toBe('poll');
  });

  it('fix_needs_review when verification FAILED', async () => {
    const result = await runScript(
      ci({
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'FAILED',
      })
    );
    expect(result.code).toBe('fix_needs_review');
    expect(result.action).toBe('done');
    expect(result.noProgressCount).toBe(0);
  });

  it('fix_needs_review when verification NOT_EXECUTABLE', async () => {
    const result = await runScript(
      ci({
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'NOT_EXECUTABLE',
      })
    );
    expect(result.code).toBe('fix_needs_review');
  });

  it('fix_needs_review when no couldAutoApply and no verificationStatus', async () => {
    const result = await runScript(
      ci({
        selfHealingStatus: 'COMPLETED',
        couldAutoApplyTasks: false,
        verificationStatus: null,
      })
    );
    expect(result.code).toBe('fix_needs_review');
  });

  it('fix_apply_ready when all tasks verified', async () => {
    const result = await runScript(
      ci({
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'COMPLETED',
        failedTaskIds: ['proj:build'],
        verifiedTaskIds: ['proj:build'],
      })
    );
    expect(result.code).toBe('fix_apply_ready');
    expect(result.action).toBe('done');
    expect(result.noProgressCount).toBe(0);
  });

  it('fix_apply_ready when only e2e tasks unverified', async () => {
    const result = await runScript(
      ci({
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'COMPLETED',
        failedTaskIds: ['proj:e2e', 'proj:build'],
        verifiedTaskIds: ['proj:build'],
      })
    );
    expect(result.code).toBe('fix_apply_ready');
  });

  it('fix_needs_local_verify when non-e2e tasks need verification', async () => {
    const result = await runScript(
      ci({
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'COMPLETED',
        failedTaskIds: ['proj:build', 'proj:lint'],
        verifiedTaskIds: [],
      })
    );
    expect(result.code).toBe('fix_needs_local_verify');
    expect(result.action).toBe('done');
    expect(result.verifiableTaskIds).toEqual(['proj:build', 'proj:lint']);
    expect(result.noProgressCount).toBe(0);
  });

  it('fix_needs_local_verify excludes e2e tasks from verifiableTaskIds', async () => {
    const result = await runScript(
      ci({
        selfHealingStatus: 'COMPLETED',
        verificationStatus: 'COMPLETED',
        failedTaskIds: ['proj:build', 'proj:e2e', 'proj:lint'],
        verifiedTaskIds: [],
      })
    );
    expect(result.code).toBe('fix_needs_local_verify');
    expect(result.verifiableTaskIds).toEqual(['proj:build', 'proj:lint']);
  });

  it('fix_failed when self-healing FAILED', async () => {
    const result = await runScript(ci({ selfHealingStatus: 'FAILED' }));
    expect(result.code).toBe('fix_failed');
    expect(result.action).toBe('done');
  });

  it('no_fix when CI failed and SH disabled', async () => {
    const result = await runScript(
      ci({
        cipeStatus: 'FAILED',
        selfHealingEnabled: false,
        failedTaskIds: ['proj:build'],
      })
    );
    expect(result.code).toBe('no_fix');
    expect(result.action).toBe('done');
  });

  it('no_fix when CI failed and SH NOT_EXECUTABLE', async () => {
    const result = await runScript(
      ci({
        cipeStatus: 'FAILED',
        selfHealingStatus: 'NOT_EXECUTABLE',
      })
    );
    expect(result.code).toBe('no_fix');
  });
});

// ─── noProgressCount ───

describe('noProgressCount', () => {
  it('resets on state change (cipeStatus changed)', async () => {
    const result = await runScript(
      ci({ cipeStatus: 'IN_PROGRESS' }),
      5,
      'medium',
      ['--no-progress-count', '3', '--prev-cipe-status', 'NOT_STARTED']
    );
    expect(result.noProgressCount).toBe(0);
  });

  it('increments when no state change', async () => {
    const result = await runScript(
      ci({ cipeStatus: 'IN_PROGRESS' }),
      0,
      'medium',
      ['--no-progress-count', '2', '--prev-cipe-status', 'IN_PROGRESS']
    );
    expect(result.noProgressCount).toBe(3);
  });

  it('resets for resetProgressCodes (ci_success)', async () => {
    const result = await runScript(
      ci({ cipeStatus: 'SUCCEEDED' }),
      0,
      'medium',
      ['--no-progress-count', '3']
    );
    expect(result.noProgressCount).toBe(0);
  });
});

// ─── Verbosity ───

describe('verbosity', () => {
  it('minimal suppresses message when status unchanged', async () => {
    const result = await runScript(
      ci({ cipeStatus: 'IN_PROGRESS' }),
      0,
      'minimal',
      ['--prev-status', 'IN_PROGRESS|null|null']
    );
    expect(result.message).toBeNull();
  });

  it('minimal shows message when status changed', async () => {
    const result = await runScript(
      ci({ cipeStatus: 'IN_PROGRESS' }),
      0,
      'minimal',
      ['--prev-status', 'NOT_STARTED|null|null']
    );
    expect(result.message).not.toBeNull();
  });

  it('verbose includes full detail', async () => {
    const result = await runScript(
      ci({ cipeStatus: 'IN_PROGRESS' }),
      2,
      'verbose'
    );
    expect(result.message).toContain('Poll #');
    expect(result.message).toContain('CI: IN_PROGRESS');
    expect(result.message).toContain('Self-healing:');
  });

  it('medium (default) includes poll number', async () => {
    const result = await runScript(ci({ cipeStatus: 'IN_PROGRESS' }), 5);
    expect(result.message).toContain('Poll #6');
  });
});

// ─── Backoff delays ───

describe('backoff delays', () => {
  it('poll action includes delay based on noProgressCount', async () => {
    const result = await runScript(ci({ cipeStatus: 'IN_PROGRESS' }));
    // noProgressCount=1 (0+1), delays[min(1,2)]=90
    expect(result.delay).toBe(90);
  });

  it('wait action has fixed 30s delay', async () => {
    const result = await runScript(ci(), 0, 'medium', [
      '--wait-mode',
      '--new-cipe-timeout',
      '600',
    ]);
    expect(result.delay).toBe(30);
  });
});

// ─── Error handling ───

describe('error handling', () => {
  it('handles invalid JSON gracefully', async () => {
    const args = [SCRIPT, 'not-valid-json', '0', 'medium'];
    const result = await new Promise((resolve, reject) => {
      execFile('node', args, (err, stdout, stderr) => {
        if (err) return reject(new Error(`${err.message}\n${stderr}`));
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch {
          reject(new Error(`Failed to parse JSON: ${stdout}`));
        }
      });
    });
    expect(result.action).toBe('done');
    expect(result.code).toBe('error');
  });
});

// ─── Fallback ───

describe('fallback', () => {
  it('returns poll with fallback code for unclassified state', async () => {
    // FAILED + selfHealingEnabled=true + selfHealingStatus set to something odd
    const result = await runScript(
      ci({
        cipeStatus: 'FAILED',
        selfHealingEnabled: true,
        selfHealingStatus: 'SOMETHING_UNEXPECTED',
        failedTaskIds: ['proj:build'],
      })
    );
    expect(result.code).toBe('fallback');
    expect(result.action).toBe('poll');
  });
});
