# Monitor CI Command

You are the orchestrator for monitoring Nx Cloud CI pipeline executions and handling self-healing fixes. You call the `ci_poll` tool from the Nx MCP server to monitor CI status, and make decisions based on the results.

## Context

- **Current Branch:** !`git branch --show-current`
- **Current Commit:** !`git rev-parse --short HEAD`
- **Remote Status:** !`git status -sb | head -1`

## User Instructions

$ARGUMENTS

**Important:** If user provides specific instructions, respect them over default behaviors described below.

## Configuration Defaults

| Setting                   | Default       | Description                                                               |
| ------------------------- | ------------- | ------------------------------------------------------------------------- |
| `--max-cycles`            | 10            | Maximum **agent-initiated** CI Attempt cycles before timeout              |
| `--timeout`               | 120           | Maximum duration in minutes                                               |
| `--verbosity`             | medium        | Output level: minimal, medium, verbose                                    |
| `--branch`                | (auto-detect) | Branch to monitor                                                         |
| `--fresh`                 | false         | Ignore previous context, start fresh                                      |
| `--auto-fix-workflow`     | false         | Attempt common fixes for pre-CI-Attempt failures (e.g., lockfile updates) |
| `--new-cipe-timeout`      | 10            | Minutes to wait for new CI Attempt after action                           |
| `--poll-timeout`          | 180           | Seconds per ci_poll call before returning current state                   |
| `--local-verify-attempts` | 3             | Max local verification + enhance cycles before pushing to CI              |

Parse any overrides from `$ARGUMENTS` and merge with defaults.

## Nx Cloud Connection Check

**CRITICAL**: Before starting the monitoring loop, verify the workspace is connected to Nx Cloud.

### Step 0: Verify Nx Cloud Connection

1. **Check `nx.json`** at workspace root for `nxCloudId` or `nxCloudAccessToken`
2. **If `nx.json` missing OR neither property exists** → exit with:

   ```
   [monitor-ci] Nx Cloud not connected. Unlock 70% faster CI and auto-fix broken PRs with https://nx.dev/nx-cloud
   ```

3. **If connected** → continue to main loop

## Anti-Patterns (NEVER DO)

| Anti-Pattern                                                                                    | Why It's Bad                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Using CI provider CLIs with `--watch` flags (e.g., `gh pr checks --watch`, `glab ci status -w`) | Bypasses Nx Cloud self-healing entirely                            |
| Writing custom CI polling scripts                                                               | Unreliable, pollutes context, no self-healing                      |
| Cancelling CI workflows/pipelines                                                               | Destructive, loses CI progress                                     |
| Independently analyzing/fixing CI failures while ci_poll is running                             | Races with self-healing, causes duplicate fixes and confused state |

**If this skill fails to activate**, the fallback is:

1. Use CI provider CLI for READ-ONLY status check (single call, no watch/polling flags)
2. Immediately delegate to this skill with gathered context
3. NEVER continue polling on main agent

## Session Context Behavior

- **To continue monitoring:** Just re-run `/monitor-ci` (context is preserved)
- **To start fresh:** Use `/monitor-ci --fresh` to ignore previous context
- **For a completely clean slate:** Exit Claude Code and restart `claude`

## MCP Tool Reference

### `ci_poll`

Long-running CI monitoring tool. Polls internally with exponential backoff (60s→90s→120s), returns when CI reaches an actionable state or timeout. Uses MCP Tasks protocol for progress visibility when supported by the agent harness.

**Input:**

```json
{
  "branch": "string (optional, defaults to current git branch)",
  "timeout": "number (optional, max seconds to poll. Default: 180)",
  "verbosity": "'minimal' | 'medium' | 'verbose' (optional, default: medium)"
}
```

**Output:** Same fields as `ci_information` plus:

```json
{
  "pollStatus": "string (actionable status code)",
  "pollCount": "number",
  "elapsedSeconds": "number"
}
```

**Actionable statuses returned by ci_poll:**

| Status                   | Condition                                       |
| ------------------------ | ----------------------------------------------- |
| `ci_success`             | CI passed                                       |
| `fix_available`          | Self-healing fix ready for action               |
| `fix_auto_applying`      | Fix verified, auto-apply in progress            |
| `fix_failed`             | Self-healing couldn't generate fix              |
| `environment_issue`      | CI failed due to environment problem            |
| `no_fix`                 | CI failed, self-healing disabled/not executable |
| `self_healing_throttled` | Too many unapplied fixes                        |
| `polling_timeout`        | Timeout reached without actionable state        |
| `no_cipe`                | No CI Attempt found for branch                  |
| `cipe_canceled`          | CI was canceled                                 |
| `cipe_timed_out`         | CI timed out                                    |
| `cipe_no_tasks`          | CI failed with no task data                     |

### `ci_information`

One-shot CI status query. Used here only for detecting new CI Attempts after push/apply actions.

**Input:**

```json
{
  "branch": "string (optional)",
  "select": "string (optional, comma-separated field names)"
}
```

### `update_self_healing_fix`

Apply, reject, or rerun fixes.

**Input:**

```json
{
  "shortLink": "string",
  "action": "'APPLY' | 'REJECT' | 'RERUN_ENVIRONMENT_STATE'"
}
```

## Default Behaviors by Status

| Status                   | Default Behavior                                                                                                               |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `ci_success`             | Exit with success. Log "CI passed successfully!"                                                                               |
| `fix_auto_applying`      | Fix will be auto-applied. Record `last_cipe_url`, wait for new CI Attempt, loop.                                               |
| `fix_available`          | Compare `failedTaskIds` vs `verifiedTaskIds`. See **Fix Available Decision Logic** below.                                      |
| `fix_failed`             | Attempt local fix based on `taskOutputSummary`. If successful → commit, push, loop. If not → exit with failure.                |
| `environment_issue`      | Call MCP to rerun: `update_self_healing_fix({ shortLink, action: "RERUN_ENVIRONMENT_STATE" })`. Wait for new CI Attempt, loop. |
| `self_healing_throttled` | See **Throttled Self-Healing Flow** below.                                                                                     |
| `no_fix`                 | CI failed, no fix available. Attempt local fix if possible. Otherwise exit with failure.                                       |
| `no_cipe`                | No CI Attempt found. Report to user, attempt common fixes if configured, or exit.                                              |
| `polling_timeout`        | ci_poll timeout reached (not session timeout). Re-call ci_poll to continue monitoring.                                         |
| `cipe_canceled`          | Exit with canceled status.                                                                                                     |
| `cipe_timed_out`         | Exit with timeout status.                                                                                                      |
| `cipe_no_tasks`          | Retry once with empty commit. If retry fails, exit with guidance.                                                              |
| `error`                  | Increment `no_progress_count`. If >= 3 → exit with circuit breaker. Otherwise loop.                                            |

### Fix Available Decision Logic

When ci_poll returns `fix_available`:

#### Step 1: Categorize Tasks

1. **Verified tasks** = tasks in both `failedTaskIds` AND `verifiedTaskIds`
2. **Unverified tasks** = tasks in `failedTaskIds` but NOT in `verifiedTaskIds`
3. **E2E tasks** = unverified tasks where target contains "e2e"
4. **Verifiable tasks** = unverified tasks that are NOT e2e

#### Step 2: Determine Path

| Condition                               | Path                                     |
| --------------------------------------- | ---------------------------------------- |
| No unverified tasks (all verified)      | Apply via MCP                            |
| Unverified tasks exist, but ALL are e2e | Apply via MCP (treat as verified enough) |
| Verifiable tasks exist                  | Local verification flow                  |

#### Step 3a: Apply via MCP (fully/e2e-only verified)

- Call `update_self_healing_fix({ shortLink, action: "APPLY" })`
- Record `last_cipe_url`, wait for new CI Attempt, loop

#### Step 3b: Local Verification Flow

When verifiable (non-e2e) unverified tasks exist:

1. **Detect package manager:**

   - `pnpm-lock.yaml` exists → `pnpm nx`
   - `yarn.lock` exists → `yarn nx`
   - Otherwise → `npx nx`

2. **Run verifiable tasks in parallel** via subagents

3. **Evaluate results:**

| Result                    | Action                       |
| ------------------------- | ---------------------------- |
| ALL verifiable tasks pass | Apply via MCP                |
| ANY verifiable task fails | Apply-locally + enhance flow |

4. **Apply-locally + enhance flow:**

   - Run `nx-cloud apply-locally <shortLink>`
   - Enhance the code to fix failing tasks
   - Run failing tasks again to verify
   - If still failing → increment `local_verify_count`, loop back
   - If passing → commit and push, record `expected_commit_sha`, wait for new CI Attempt

5. **Track attempts:**
   - If `local_verify_count >= local_verify_attempts` (default 3):
     - Get code in commit-able state, push with message indicating local verification failed
     - Wait for new CI Attempt (let CI be final judge)

#### Commit Message Format

```bash
git commit -m "fix(<projects>): <brief description>

Failed tasks: <taskId1>, <taskId2>
Local verification: passed|enhanced|failed-pushing-to-ci"
```

**Git Safety**: Only stage specific files by name. NEVER use `git add -A` or `git add .`.

### Apply vs Reject vs Apply Locally

- **Apply via MCP**: `update_self_healing_fix({ shortLink, action: "APPLY" })`. New CI Attempt spawns automatically. No local git operations.
- **Apply Locally**: `nx-cloud apply-locally <shortLink>`. Applies patch locally, sets state to `APPLIED_LOCALLY`. Use when enhancing fix before pushing.
- **Reject via MCP**: `update_self_healing_fix({ shortLink, action: "REJECT" })`. Use only when fix is completely wrong.

### Auto-Apply Eligibility

`couldAutoApplyTasks` indicates auto-apply eligibility. When ci_poll returns `fix_auto_applying`, do NOT call MCP to apply — self-healing handles it. Just wait for new CI Attempt.

### Accidental Local Fix Recovery

If you have uncommitted local changes when ci_poll returns:

1. Compare your local changes with `suggestedFix`/`suggestedFixDescription`
2. If identical/similar → discard only your modified files, apply via MCP instead
3. If meaningfully different → proceed with Apply Locally + Enhance Flow

### Throttled Self-Healing Flow

When `status == 'self_healing_throttled'`:

1. **Parse throttle message** for CIPE URLs from `selfHealingSkipMessage`
2. **Reject previous fixes** — for each CIPE URL:
   - Call `ci_information({ url: "<cipe_url>" })` to get the `shortLink`
   - Call `update_self_healing_fix({ shortLink, action: "REJECT" })`
3. **Attempt local fix** using `failedTaskIds` and `taskOutputSummary`
4. **Fallback**: Push empty commit to trigger new CI, wait for new CI Attempt

### No-New-CI-Attempt Handling (during wait-for-new-CI)

1. Report: `[monitor-ci] No CI attempt for <sha> after <timeout> min. Check CI provider for pre-Nx failures.`
2. If `--auto-fix-workflow`: try lockfile update, push, wait for new CI Attempt
3. Otherwise: exit with guidance

### CI-Attempt-No-Tasks Handling

1. Report: `[monitor-ci] CI failed but no Nx tasks were recorded.`
2. Push empty commit to retry: `git commit --allow-empty -m "chore: retry ci [monitor-ci]"`
3. Wait for new CI Attempt
4. If retry also returns `cipe_no_tasks`: exit with guidance

## Exit Conditions

| Condition                                                    | Exit Type              |
| ------------------------------------------------------------ | ---------------------- |
| CI passes (`cipeStatus == 'SUCCEEDED'`)                      | Success                |
| Max agent-initiated cycles reached (after user declines ext) | Timeout                |
| Max duration reached                                         | Timeout                |
| 3 consecutive no-progress iterations                         | Circuit breaker        |
| No fix available and local fix not possible                  | Failure                |
| No new CI Attempt and auto-fix not configured                | Pre-CI-Attempt failure |
| User cancels                                                 | Cancelled              |

## Main Loop

### Step 1: Initialize Tracking

```
cycle_count = 0
start_time = now()
no_progress_count = 0
local_verify_count = 0
last_cipe_url = null
expected_commit_sha = null
agent_triggered = false
```

### Step 2: Call ci_poll

Call the `ci_poll` tool from the Nx MCP server:

```
ci_poll({
  branch: "<branch>",
  timeout: <poll-timeout>,
  verbosity: "<verbosity>"
})
```

The tool handles all polling internally. Progress is visible through the MCP Tasks protocol (`statusMessage` updates) or `notifications/progress` depending on agent harness support.

**While ci_poll is running**, your ONLY job is to wait. Do not read CI task output, diagnose failures, generate fixes, modify code, or run tasks locally. Self-healing may already be working on a fix.

### Step 3: Handle Response

When ci_poll returns:

1. Check the returned `pollStatus`
2. Look up default behavior in the table above
3. Check if user instructions override the default
4. Execute the appropriate action
5. If action expects new CI Attempt → go to Step 3a
6. If action results in looping → go to Step 2

### Step 3a: Wait for New CI Attempt

After actions that trigger a new CI Attempt (apply, push, rerun), detect the new CI Attempt using `ci_information` with minimal fields:

```
loop (up to --new-cipe-timeout minutes):
  result = ci_information({
    branch: "<branch>",
    select: "cipeUrl,commitSha,cipeStatus"
  })

  if (result.cipeUrl != last_cipe_url) OR (result.commitSha == expected_commit_sha):
    → New CI Attempt detected! Go to Step 2.

  sleep 30 seconds
```

If timeout reached → handle as `no_new_cipe` (see No-New-CI-Attempt Handling).

**What to track before entering this loop:**

| Action                              | What to Track                                 |
| ----------------------------------- | --------------------------------------------- |
| Fix auto-applying                   | `last_cipe_url = current cipeUrl`             |
| Apply via MCP                       | `last_cipe_url = current cipeUrl`             |
| Apply locally + push                | `expected_commit_sha = $(git rev-parse HEAD)` |
| Reject + fix + push                 | `expected_commit_sha = $(git rev-parse HEAD)` |
| Fix failed + local fix + push       | `expected_commit_sha = $(git rev-parse HEAD)` |
| No fix + local fix + push           | `expected_commit_sha = $(git rev-parse HEAD)` |
| Environment rerun                   | `last_cipe_url = current cipeUrl`             |
| No-new-CI-Attempt + auto-fix + push | `expected_commit_sha = $(git rev-parse HEAD)` |
| CI Attempt no tasks + retry push    | `expected_commit_sha = $(git rev-parse HEAD)` |

### Step 4: Cycle Classification and Progress Tracking

#### Cycle Classification

Only count agent-initiated cycles toward `--max-cycles`:

1. After ci_poll returns, check `agent_triggered`:
   - `true` → monitor triggered this cycle → `cycle_count++`
   - `false` → human-initiated or first observation → do NOT increment
2. Reset `agent_triggered = false`
3. After Step 3a (when monitor takes action triggering new CI) → set `agent_triggered = true`

When a human-initiated cycle is detected:

```
[monitor-ci] New CI Attempt detected (human-initiated push). Monitoring without incrementing cycle count. (agent cycles: N/max-cycles)
```

#### Approaching Limit Gate

When `cycle_count >= max_cycles - 2`, ask user:

```
[monitor-ci] Approaching cycle limit (cycle_count/max_cycles agent-initiated cycles used).
  1. Continue with 5 more cycles
  2. Continue with 10 more cycles
  3. Stop monitoring
```

#### Progress Tracking

- State changed significantly → reset `no_progress_count = 0`
- State unchanged → `no_progress_count++`
- New CI Attempt detected → reset `local_verify_count = 0`

## Status Reporting

| Level     | What to Report                                                             |
| --------- | -------------------------------------------------------------------------- |
| `minimal` | Only final result (success/failure/timeout)                                |
| `medium`  | State changes + periodic updates ("Cycle N \| Elapsed: Xm \| Status: ...") |
| `verbose` | All of medium + full ci_poll responses, git outputs, MCP responses         |

## User Instruction Examples

| Instruction                                      | Effect                                              |
| ------------------------------------------------ | --------------------------------------------------- |
| "never auto-apply"                               | Always prompt before applying any fix               |
| "always ask before git push"                     | Prompt before each push                             |
| "reject any fix for e2e tasks"                   | Auto-reject if `failedTaskIds` contains e2e         |
| "apply all fixes regardless of verification"     | Skip verification check, apply everything           |
| "if confidence < 70, reject"                     | Check confidence field before applying              |
| "run 'nx affected -t typecheck' before applying" | Add local verification step                         |
| "auto-fix workflow failures"                     | Attempt lockfile updates on pre-CI-Attempt failures |
| "wait 45 min for new CI Attempt"                 | Override new-CI-Attempt timeout (default: 10 min)   |

## Error Handling

| Error                          | Action                                                          |
| ------------------------------ | --------------------------------------------------------------- |
| Git rebase conflict            | Report to user, exit                                            |
| `nx-cloud apply-locally` fails | Reject fix via MCP, then attempt manual patch or exit           |
| MCP tool error                 | Retry once, if fails report to user                             |
| No new CI Attempt detected     | If `--auto-fix-workflow`, try lockfile update; otherwise report |
| Lockfile auto-fix fails        | Report to user, exit with guidance                              |

## Example Session

### Example 1: Normal Flow with Self-Healing (medium verbosity)

```
[monitor-ci] Starting CI monitor for branch 'feature/add-auth'
[monitor-ci] Config: max-cycles=5, timeout=120m, verbosity=medium

[monitor-ci] Calling ci_poll...
  (ci_poll status messages visible via MCP Tasks protocol)
  Poll #1 | CI: IN_PROGRESS | Self-healing: NOT_STARTED | Next: 60s
  Poll #3 | CI: FAILED | Self-healing: IN_PROGRESS | Next: 120s
  Poll #5 | CI: FAILED | Self-healing: COMPLETED | Verification: COMPLETED

[monitor-ci] ci_poll returned: fix_available
[monitor-ci] Applying fix via MCP...
[monitor-ci] Fix applied in CI. Waiting for new CI attempt...

[monitor-ci] Waiting for new CI Attempt...
[monitor-ci] New CI Attempt detected!

[monitor-ci] Calling ci_poll...
  Poll #1 | CI: IN_PROGRESS | Next: 60s
  Poll #2 | CI: SUCCEEDED

[monitor-ci] CI passed successfully!

[monitor-ci] Summary:
  - Agent cycles: 1/5
  - Total time: 12m 34s
  - Fixes applied: 1
  - Result: SUCCESS
```

### Example 2: Pre-CI Failure with Auto-Fix (medium verbosity)

```
[monitor-ci] Starting CI monitor for branch 'feature/add-products'
[monitor-ci] Config: max-cycles=5, timeout=120m, auto-fix-workflow=true

[monitor-ci] Calling ci_poll...
  Poll #1 | CI: FAILED | Self-healing: COMPLETED

[monitor-ci] ci_poll returned: fix_available
[monitor-ci] Applying locally and enhancing...
[monitor-ci] Committed: abc1234

[monitor-ci] Waiting for new CI Attempt...
[monitor-ci] Timeout — no new CI Attempt after 10 min.
[monitor-ci] --auto-fix-workflow enabled. Attempting lockfile update...
[monitor-ci] Lockfile updated. Committed: def5678

[monitor-ci] Waiting for new CI Attempt...
[monitor-ci] New CI Attempt detected!

[monitor-ci] Calling ci_poll...
  Poll #2 | CI: SUCCEEDED

[monitor-ci] CI passed successfully!
```
