#!/usr/bin/env node

/**
 * CI Poll Decision Script
 *
 * Deterministic decision engine for CI monitoring.
 * Takes ci_information JSON + state args, outputs a single JSON action line.
 *
 * Usage:
 *   node ci-poll-decide.mjs '<ci_info_json>' <poll_count> <verbosity> \
 *     [--wait-mode] [--prev-cipe-url <url>] [--expected-sha <sha>] \
 *     [--prev-status <status>] [--timeout <seconds>] [--new-cipe-timeout <seconds>] \
 *     [--env-rerun-count <n>] [--no-progress-count <n>] [--prev-cipe-status <status>]
 */

// --- Arg parsing ---

const args = process.argv.slice(2);
const ciInfoJson = args[0];
const pollCount = parseInt(args[1], 10) || 0;
const verbosity = args[2] || 'medium';

function getFlag(name) {
  return args.includes(name);
}

function getArg(name) {
  const idx = args.indexOf(name);
  return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : null;
}

const waitMode = getFlag('--wait-mode');
const prevCipeUrl = getArg('--prev-cipe-url');
const expectedSha = getArg('--expected-sha');
const prevStatus = getArg('--prev-status');
const timeoutSeconds = parseInt(getArg('--timeout') || '0', 10);
const newCipeTimeoutSeconds = parseInt(getArg('--new-cipe-timeout') || '0', 10);
let envRerunCount = parseInt(getArg('--env-rerun-count') || '0', 10);
let noProgressCount = parseInt(getArg('--no-progress-count') || '0', 10);
const prevCipeStatus = getArg('--prev-cipe-status');

// --- Parse CI info ---

let ci;
try {
  ci = JSON.parse(ciInfoJson);
} catch {
  output({
    action: 'done',
    status: 'error',
    message: 'Failed to parse ci_information JSON',
    noProgressCount: noProgressCount + 1,
    envRerunCount,
  });
  process.exit(0);
}

const {
  cipeStatus,
  selfHealingStatus,
  verificationStatus,
  selfHealingEnabled,
  selfHealingSkippedReason,
  failureClassification,
  failedTaskIds = [],
  verifiedTaskIds = [],
  couldAutoApplyTasks,
  userAction,
  cipeUrl,
  commitSha,
} = ci;

// --- Task categorization ---

function categorizeTasks() {
  const verifiedSet = new Set(verifiedTaskIds);
  const unverified = failedTaskIds.filter((t) => !verifiedSet.has(t));
  if (unverified.length === 0) return { category: 'all_verified' };

  const e2e = unverified.filter((t) => {
    const parts = t.split(':');
    return parts.length >= 2 && parts[1].includes('e2e');
  });
  if (e2e.length === unverified.length) return { category: 'e2e_only' };

  const verifiable = unverified.filter((t) => {
    const parts = t.split(':');
    return !(parts.length >= 2 && parts[1].includes('e2e'));
  });
  return { category: 'needs_local_verify', verifiableTaskIds: verifiable };
}

// --- Backoff ---

function backoff(count) {
  const delays = [60, 90, 120];
  return delays[Math.min(count, delays.length - 1)];
}

// --- Timeout check ---

function checkTimeout() {
  if (timeoutSeconds > 0) {
    // Estimate elapsed time from poll count using average delay
    const avgDelay = pollCount === 0 ? 0 : backoff(Math.floor(pollCount / 2));
    const estimatedElapsed = pollCount * avgDelay;
    if (estimatedElapsed >= timeoutSeconds) {
      return true;
    }
  }
  return false;
}

// --- No-progress tracking ---
// Reset only when cipeStatus changed or new CI Attempt detected

function updateNoProgressCount(isNewCipe) {
  if (isNewCipe || (prevCipeStatus && cipeStatus !== prevCipeStatus)) {
    noProgressCount = 0;
  } else {
    noProgressCount++;
  }
}

// --- Status message formatting ---

function formatMessage(msg) {
  if (verbosity === 'minimal') {
    // Only emit on state transition
    const currentStatus = `${cipeStatus}|${selfHealingStatus}|${verificationStatus}`;
    const prev = prevStatus || '';
    if (currentStatus === prev) return null;
    return msg;
  }
  if (verbosity === 'verbose') {
    const lines = [
      `Poll #${pollCount + 1} | CI: ${cipeStatus || 'N/A'} | Self-healing: ${
        selfHealingStatus || 'N/A'
      } | Verification: ${verificationStatus || 'N/A'}`,
      msg,
    ];
    return lines.join('\n');
  }
  // medium (default)
  return `Poll #${pollCount + 1} | ${msg}`;
}

// --- Output ---

function output(result) {
  // Ensure noProgressCount and envRerunCount are always present
  result.noProgressCount =
    result.noProgressCount !== undefined
      ? result.noProgressCount
      : noProgressCount;
  result.envRerunCount =
    result.envRerunCount !== undefined ? result.envRerunCount : envRerunCount;
  console.log(JSON.stringify(result));
}

// --- Decision logic ---

function decide() {
  // Wait mode checks
  if (waitMode) {
    const isNewCipe =
      (prevCipeUrl && cipeUrl && cipeUrl !== prevCipeUrl) ||
      (expectedSha && commitSha && commitSha === expectedSha);

    if (isNewCipe) {
      updateNoProgressCount(true);
      const msg = formatMessage(
        `New CI Attempt detected! CI: ${cipeStatus || 'N/A'}`
      );
      return output({
        action: 'poll',
        delay: 60,
        message: msg,
        fields: 'light',
        newCipeDetected: true,
        noProgressCount,
        envRerunCount,
      });
    }

    // Check new-cipe timeout
    if (newCipeTimeoutSeconds > 0) {
      const waitDelay = 30;
      const estimatedWaitElapsed = pollCount * waitDelay;
      if (estimatedWaitElapsed >= newCipeTimeoutSeconds) {
        const msg = formatMessage(
          'New CI Attempt timeout exceeded. No new CI Attempt detected.'
        );
        return output({
          action: 'done',
          status: 'no_new_cipe',
          message: msg,
          noProgressCount,
          envRerunCount,
        });
      }
    }

    const msg = formatMessage('Waiting for new CI Attempt...');
    return output({
      action: 'wait',
      delay: 30,
      message: msg,
      noProgressCount,
      envRerunCount,
    });
  }

  // Normal mode: check polling timeout
  if (checkTimeout()) {
    const msg = formatMessage('Polling timeout exceeded.');
    return output({
      action: 'done',
      status: 'polling_timeout',
      message: msg,
      noProgressCount,
      envRerunCount,
    });
  }

  updateNoProgressCount(false);

  // Circuit breaker
  if (noProgressCount >= 3) {
    return output({
      action: 'done',
      status: 'circuit_breaker',
      message: formatMessage(
        'No progress after 3 consecutive polls. Stopping.'
      ),
      noProgressCount,
      envRerunCount,
    });
  }

  // Immediate exits
  if (cipeStatus === 'SUCCEEDED') {
    return output({
      action: 'done',
      status: 'ci_success',
      message: formatMessage('CI passed successfully!'),
      noProgressCount: 0,
      envRerunCount,
    });
  }

  if (cipeStatus === 'CANCELED') {
    return output({
      action: 'done',
      status: 'cipe_canceled',
      message: formatMessage('CI Attempt was canceled.'),
      noProgressCount,
      envRerunCount,
    });
  }

  if (cipeStatus === 'TIMED_OUT') {
    return output({
      action: 'done',
      status: 'cipe_timed_out',
      message: formatMessage('CI Attempt timed out.'),
      noProgressCount,
      envRerunCount,
    });
  }

  // No tasks recorded
  if (
    cipeStatus === 'FAILED' &&
    failedTaskIds.length === 0 &&
    selfHealingStatus == null
  ) {
    return output({
      action: 'done',
      status: 'cipe_no_tasks',
      message: formatMessage('CI failed but no Nx tasks were recorded.'),
      noProgressCount,
      envRerunCount,
    });
  }

  // Environment issue
  if (failureClassification === 'ENVIRONMENT_STATE') {
    if (envRerunCount >= 2) {
      return output({
        action: 'done',
        status: 'environment_rerun_cap',
        message: formatMessage(`Environment rerun cap (2) exceeded. Bailing.`),
        noProgressCount,
        envRerunCount,
      });
    }
    return output({
      action: 'done',
      status: 'environment_issue',
      message: formatMessage(`CI: FAILED | Classification: ENVIRONMENT_STATE`),
      noProgressCount,
      envRerunCount,
    });
  }

  // Throttled self-healing
  if (selfHealingSkippedReason === 'THROTTLED') {
    return output({
      action: 'done',
      status: 'self_healing_throttled',
      message: formatMessage(
        'Self-healing throttled — too many unapplied fixes.'
      ),
      noProgressCount,
      envRerunCount,
    });
  }

  // Keep polling: CI in progress or not started
  if (cipeStatus === 'IN_PROGRESS' || cipeStatus === 'NOT_STARTED') {
    return output({
      action: 'poll',
      delay: backoff(pollCount),
      message: formatMessage(`CI: ${cipeStatus}`),
      fields: 'light',
      noProgressCount,
      envRerunCount,
    });
  }

  // Keep polling: self-healing in progress (without skipped reason)
  if (
    (selfHealingStatus === 'IN_PROGRESS' ||
      selfHealingStatus === 'NOT_STARTED') &&
    !selfHealingSkippedReason
  ) {
    return output({
      action: 'poll',
      delay: backoff(pollCount),
      message: formatMessage(
        `CI: ${cipeStatus} | Self-healing: ${selfHealingStatus}`
      ),
      fields: 'light',
      noProgressCount,
      envRerunCount,
    });
  }

  // Keep polling: flaky task auto-rerun
  if (failureClassification === 'FLAKY_TASK') {
    return output({
      action: 'poll',
      delay: backoff(pollCount),
      message: formatMessage(
        'CI: FAILED | Classification: FLAKY_TASK (auto-rerun in progress)'
      ),
      fields: 'light',
      noProgressCount,
      envRerunCount,
    });
  }

  // Keep polling: auto-applied, new CI Attempt spawning
  if (userAction === 'APPLIED_AUTOMATICALLY') {
    return output({
      action: 'poll',
      delay: backoff(pollCount),
      message: formatMessage(
        'CI: FAILED | Fix auto-applied, new CI Attempt spawning'
      ),
      fields: 'light',
      noProgressCount,
      envRerunCount,
    });
  }

  // Auto-apply path
  if (couldAutoApplyTasks === true) {
    if (
      verificationStatus === 'NOT_STARTED' ||
      verificationStatus === 'IN_PROGRESS'
    ) {
      return output({
        action: 'poll',
        delay: backoff(pollCount),
        message: formatMessage(
          `CI: FAILED | Self-healing: COMPLETED | Verification: ${verificationStatus}`
        ),
        fields: 'light',
        noProgressCount,
        envRerunCount,
      });
    }
    if (verificationStatus === 'COMPLETED') {
      return output({
        action: 'done',
        status: 'fix_auto_applying',
        message: formatMessage('Fix verified! Auto-applying...'),
        noProgressCount: 0,
        envRerunCount,
      });
    }
    // verification FAILED or NOT_EXECUTABLE falls through to fix_needs_review
  }

  // Fix available — categorize tasks to determine specific status
  if (selfHealingStatus === 'COMPLETED') {
    // If verification failed/not-executable/not-attempted, skill needs to judge fix quality
    if (
      verificationStatus === 'FAILED' ||
      verificationStatus === 'NOT_EXECUTABLE' ||
      (couldAutoApplyTasks !== true && !verificationStatus)
    ) {
      return output({
        action: 'done',
        status: 'fix_needs_review',
        message: formatMessage(
          `Fix available but needs review. Verification: ${
            verificationStatus || 'N/A'
          }`
        ),
        noProgressCount: 0,
        envRerunCount,
      });
    }

    const { category, verifiableTaskIds } = categorizeTasks();
    if (category === 'all_verified' || category === 'e2e_only') {
      return output({
        action: 'done',
        status: 'fix_apply_ready',
        message: formatMessage('Fix available and verified. Ready to apply.'),
        noProgressCount: 0,
        envRerunCount,
      });
    }

    return output({
      action: 'done',
      status: 'fix_needs_local_verify',
      message: formatMessage(
        `Fix available. ${verifiableTaskIds.length} task(s) need local verification.`
      ),
      verifiableTaskIds,
      noProgressCount: 0,
      envRerunCount,
    });
  }

  // Fix failed
  if (selfHealingStatus === 'FAILED') {
    return output({
      action: 'done',
      status: 'fix_failed',
      message: formatMessage('Self-healing failed to generate a fix.'),
      noProgressCount,
      envRerunCount,
    });
  }

  // No fix available
  if (
    cipeStatus === 'FAILED' &&
    (selfHealingEnabled === false || selfHealingStatus === 'NOT_EXECUTABLE')
  ) {
    return output({
      action: 'done',
      status: 'no_fix',
      message: formatMessage('CI failed, no fix available.'),
      noProgressCount,
      envRerunCount,
    });
  }

  // Fallback: keep polling
  return output({
    action: 'poll',
    delay: backoff(pollCount),
    message: formatMessage(
      `CI: ${cipeStatus || 'N/A'} | Self-healing: ${
        selfHealingStatus || 'N/A'
      } | Verification: ${verificationStatus || 'N/A'}`
    ),
    fields: 'light',
    noProgressCount,
    envRerunCount,
  });
}

decide();
