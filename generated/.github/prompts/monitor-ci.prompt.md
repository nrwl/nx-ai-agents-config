---
description: Monitor Nx Cloud CI pipeline and handle self-healing fixes. USE WHEN user says "monitor ci", "watch ci", "ci monitor", "watch ci for this branch", "track ci", "check ci status", wants to track CI status, or needs help with self-healing CI fixes. ALWAYS USE THIS SKILL instead of native CI provider tools (gh, glab, etc.) for CI monitoring.
argument-hint: '[instructions] [--max-cycles N] [--timeout MINUTES] [--verbosity minimal|medium|verbose] [--branch BRANCH] [--fresh] [--auto-fix-workflow] [--new-cipe-timeout MINUTES] [--local-verify-attempts N]'
---

# Monitor CI Command

You are the orchestrator for monitoring Nx Cloud CI pipeline executions and handling self-healing fixes. You spawn subagents to interact with Nx Cloud, run a deterministic decision script, and take action based on the results.

## Context

- **Current Branch:** !`git branch --show-current`
- **Current Commit:** !`git rev-parse --short HEAD`
- **Remote Status:** !`git status -sb | head -1`

## User Instructions

${input:args}

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
| `--local-verify-attempts` | 3             | Max local verification + enhance cycles before pushing to CI              |

Parse any overrides from `${input:args}` and merge with defaults.

## Nx Cloud Connection Check

**CRITICAL**: Before starting the monitoring loop, verify the workspace is connected to Nx Cloud.

### Step 0: Verify Nx Cloud Connection

1. **Check `nx.json`** at workspace root for `nxCloudId` or `nxCloudAccessToken`
2. **If `nx.json` missing OR neither property exists** → exit with:

   ```
   Nx Cloud not connected. Unlock 70% faster CI and auto-fix broken PRs with https://nx.dev/nx-cloud
   ```

3. **If connected** → continue to main loop

## Anti-Patterns (NEVER DO)

**CRITICAL**: The following behaviors are strictly prohibited:

| Anti-Pattern                                                                                    | Why It's Bad                                                       |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Using CI provider CLIs with `--watch` flags (e.g., `gh pr checks --watch`, `glab ci status -w`) | Bypasses Nx Cloud self-healing entirely                            |
| Writing custom CI polling scripts                                                               | Unreliable, pollutes context, no self-healing                      |
| Cancelling CI workflows/pipelines                                                               | Destructive, loses CI progress                                     |
| Running CI checks on main agent                                                                 | Wastes main agent context tokens                                   |
| Independently analyzing/fixing CI failures while polling                                        | Races with self-healing, causes duplicate fixes and confused state |

**If this skill fails to activate**, the fallback is:

1. Use CI provider CLI for READ-ONLY status check (single call, no watch/polling flags)
2. Immediately delegate to this skill with gathered context
3. NEVER continue polling on main agent

**CI provider CLIs are acceptable ONLY for:**

- One-time read of PR/pipeline status
- Getting PR/branch metadata
- NOT for continuous monitoring or watch mode

## Session Context Behavior

**Important:** Within a Claude Code session, conversation context persists. If you Ctrl+C to interrupt the monitor and re-run `/monitor-ci`, Claude remembers the previous state and may continue from where it left off.

- **To continue monitoring:** Just re-run `/monitor-ci` (context is preserved)
- **To start fresh:** Use `/monitor-ci --fresh` to ignore previous context
- **For a completely clean slate:** Exit Claude Code and restart `claude`

## Architecture Overview

1. **This skill (orchestrator)**: spawns subagents, runs decision script, prints status, does local coding work
2. **ci-monitor-subagent (haiku)**: calls one MCP tool (ci_information or update_self_healing_fix), returns structured result, exits
3. **ci-poll-decide.mjs (deterministic script)**: takes ci_information result + state, returns action + status message

## Status Reporting

The decision script handles message formatting based on verbosity. When printing messages to the user:

- Prepend `[monitor-ci]` to every message from the script's `message` field
- For your own action messages (e.g. "Applying fix via MCP..."), also prepend `[monitor-ci]`

## MCP Tool Reference

### `ci_information`

**Input:**

```json
{
  "branch": "string (optional, defaults to current git branch)",
  "select": "string (optional, comma-separated field names)",
  "pageToken": "number (optional, 0-based pagination for long strings)"
}
```

**Field Sets for Efficient Polling:**

```yaml
WAIT_FIELDS:
  'cipeUrl,commitSha,cipeStatus'
  # Minimal fields for detecting new CI Attempt

LIGHT_FIELDS:
  'cipeStatus,cipeUrl,branch,commitSha,selfHealingStatus,verificationStatus,userAction,failedTaskIds,verifiedTaskIds,selfHealingEnabled,failureClassification,couldAutoApplyTasks,shortLink,confidence,confidenceReasoning,hints,selfHealingSkippedReason,selfHealingSkipMessage'
  # Status fields for determining actionable state

HEAVY_FIELDS:
  'taskOutputSummary,suggestedFix,suggestedFixReasoning,suggestedFixDescription'
  # Large content fields - fetch only when needed for fix decisions
```

## Default Behaviors by Status

The decision script returns one of the following statuses. This table defines the **default behavior** for each. User instructions can override any of these.

**Simple exits** — just report and exit:

| Status                  | Default Behavior                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `ci_success`            | Exit with success                                                                                     |
| `cipe_canceled`         | Exit, CI was canceled                                                                                 |
| `cipe_timed_out`        | Exit, CI timed out                                                                                    |
| `polling_timeout`       | Exit, polling timeout reached                                                                         |
| `circuit_breaker`       | Exit, no progress after 3 consecutive polls                                                           |
| `environment_rerun_cap` | Exit, environment reruns exhausted                                                                    |
| `fix_auto_applying`     | Do NOT call MCP — self-healing handles it. Record `last_cipe_url`, enter wait mode. No local git ops. |
| `error`                 | Wait 60s and loop                                                                                     |

**Statuses requiring action** — see subsections below:

| Status                   | Summary                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| `fix_apply_ready`        | Fix verified (all tasks or e2e-only). Apply via MCP.                                                    |
| `fix_needs_local_verify` | Fix has unverified non-e2e tasks. Run locally, then apply or enhance.                                   |
| `fix_needs_review`       | Fix verification failed/not attempted. Analyze and decide.                                              |
| `fix_failed`             | Self-healing failed. Fetch heavy data, attempt local fix (subject to `local_verify_count` budget).      |
| `no_fix`                 | No fix available. Fetch heavy data, attempt local fix (subject to `local_verify_count` budget) or exit. |
| `environment_issue`      | Request environment rerun via MCP. Subject to `environment_rerun_count` cap (max 2 consecutive).        |
| `self_healing_throttled` | Reject old fixes, attempt local fix.                                                                    |
| `no_new_cipe`            | CI Attempt never spawned. Auto-fix workflow or exit with guidance.                                      |
| `cipe_no_tasks`          | CI failed with no tasks. Retry once with empty commit.                                                  |

### fix_apply_ready

- Spawn UPDATE_FIX subagent with `APPLY`
- Record `last_cipe_url`, enter wait mode

### fix_needs_local_verify

The script returns `verifiableTaskIds` in its output.

1. **Detect package manager:** `pnpm-lock.yaml` → `pnpm nx`, `yarn.lock` → `yarn nx`, otherwise `npx nx`
2. **Run verifiable tasks in parallel** — spawn `general` subagents for each task
3. **If all pass** → spawn UPDATE_FIX subagent with `APPLY`, enter wait mode
4. **If any fail** → Apply Locally + Enhance Flow (see below)

### fix_needs_review

Spawn FETCH_HEAVY subagent, then analyze fix content (`suggestedFixDescription`, `suggestedFixSummary`, `taskFailureSummaries`):

- If fix looks correct → apply via MCP
- If fix needs enhancement → Apply Locally + Enhance Flow
- If fix is wrong → check `local_verify_count` budget first. If exhausted, exit with failure. Otherwise → Reject + Fix From Scratch Flow

### fix_failed / no_fix

Spawn FETCH_HEAVY subagent for `taskFailureSummaries`. Check `local_verify_count` budget — if exhausted, exit with failure. Otherwise increment `local_verify_count`, attempt local fix. If successful → commit, push, enter wait mode. If not → exit with failure.

### environment_issue

1. Increment `env_rerun_count`. If `env_rerun_count >= 2` → bail with message that environment issue persists after N reruns, manual investigation needed
2. Spawn UPDATE_FIX subagent with `RERUN_ENVIRONMENT_STATE`
3. Enter wait mode with `last_cipe_url` set

### self_healing_throttled

Spawn FETCH_HEAVY subagent for `selfHealingSkipMessage`.

1. **Parse throttle message** for CI Attempt URLs (regex: `/cipes/{id}`)
2. **Reject previous fixes** — for each URL: spawn FETCH_THROTTLE_INFO to get `shortLink`, then UPDATE_FIX with `REJECT`
3. **Attempt local fix** (subject to `local_verify_count` budget):
   - If `local_verify_count >= local_verify_attempts` → skip to step 4 (fallback)
   - Increment `local_verify_count`
   - Use `failedTaskIds` and `taskFailureSummaries` for context
4. **Fallback if local fix not possible or budget exhausted**: push empty commit (`git commit --allow-empty -m "ci: rerun after rejecting throttled fixes"`), enter wait mode

### no_new_cipe

1. Report to user: no CI attempt found, suggest checking CI provider
2. If `--auto-fix-workflow`: detect package manager, run install, commit lockfile if changed, enter wait mode
3. Otherwise: exit with guidance

### cipe_no_tasks

1. Report to user: CI failed with no tasks recorded
2. Retry: `git commit --allow-empty -m "chore: retry ci [monitor-ci]"` + push, enter wait mode
3. If retry also returns `cipe_no_tasks`: exit with failure

## Fix Action Flows

### Apply via MCP

Spawn UPDATE_FIX subagent with `APPLY`. New CI Attempt spawns automatically. No local git ops.

### Apply Locally + Enhance Flow

1. `nx-cloud apply-locally <shortLink>` (sets state to `APPLIED_LOCALLY`)
2. Enhance code to fix failing tasks
3. Run failing tasks to verify
4. If still failing → increment `local_verify_count`, loop back to enhance
5. If passing → commit and push, enter wait mode

### Reject + Fix From Scratch Flow

1. **Check budget**: If `local_verify_count >= local_verify_attempts` → do NOT attempt. Exit with failure (local fix budget exhausted)
2. Spawn UPDATE_FIX subagent with `REJECT`
3. Increment `local_verify_count`
4. Fix from scratch locally
5. Commit and push, enter wait mode

### Git Safety

- NEVER use `git add -A` or `git add .` — always stage specific files by name
- Users may have concurrent local changes that must NOT be committed

### Commit Message Format

```bash
git commit -m "fix(<projects>): <brief description>

Failed tasks: <taskId1>, <taskId2>
Local verification: passed|enhanced|failed-pushing-to-ci"
```

## Main Loop

### Step 1: Initialize Tracking

```
cycle_count = 0            # Only incremented for agent-initiated cycles (counted against --max-cycles)
start_time = now()
no_progress_count = 0
local_verify_count = 0
env_rerun_count = 0
last_cipe_url = null
expected_commit_sha = null
agent_triggered = false    # Set true after monitor takes an action that triggers new CI Attempt
poll_count = 0
wait_mode = false
prev_status = null
prev_cipe_status = null
```

### Step 2: Polling Loop

Repeat until done:

#### 2a. Spawn subagent (FETCH_STATUS)

Determine select fields based on mode:

- **Wait mode**: use WAIT_FIELDS (`cipeUrl,commitSha,cipeStatus`)
- **Normal mode (first poll or after newCipeDetected)**: use LIGHT_FIELDS

```
Task(
  agent: "ci-monitor-subagent",
  model: haiku,
  prompt: "FETCH_STATUS for branch '<branch>'.
           select: '<fields>'"
)
```

The subagent calls `ci_information` and returns a JSON object with the requested fields. This is a **foreground** call — wait for the result.

#### 2b. Run decision script

```bash
node <skill_dir>/scripts/ci-poll-decide.mjs '<subagent_result_json>' <poll_count> <verbosity> \
  [--wait-mode] \
  [--prev-cipe-url <last_cipe_url>] \
  [--expected-sha <expected_commit_sha>] \
  [--prev-status <prev_status>] \
  [--timeout <timeout_seconds>] \
  [--new-cipe-timeout <new_cipe_timeout_seconds>] \
  [--env-rerun-count <env_rerun_count>] \
  [--no-progress-count <no_progress_count>] \
  [--prev-cipe-status <prev_cipe_status>]
```

The script outputs a single JSON line with `action`, `status`, `message`, `delay`, and updated counters.

#### 2c. Process script output

Parse the JSON output and update tracking state:

- `no_progress_count = output.noProgressCount`
- `env_rerun_count = output.envRerunCount`
- `prev_cipe_status = subagent_result.cipeStatus`
- `prev_status = output.action + ":" + (output.status || subagent_result.cipeStatus)`
- `poll_count++`

Based on `action`:

- **`action == "poll"`**: Print `output.message`, sleep `output.delay` seconds, go to 2a
  - If `output.newCipeDetected`: clear wait mode, reset `wait_mode = false`
- **`action == "wait"`**: Print `output.message`, sleep `output.delay` seconds, go to 2a
- **`action == "done"`**: Proceed to Step 3 with `output.status`

### Step 3: Handle Actionable Status

When decision script returns `action == "done"`:

1. Check the returned `status`
2. Look up default behavior in the table above
3. Check if user instructions override the default
4. Execute the appropriate action
5. **If action expects new CI Attempt**, update tracking (see Step 3a)
6. If action results in looping, go to Step 2

#### Spawning subagents for actions

Several statuses require fetching heavy data or calling MCP:

- **fix_apply_ready**: Spawn UPDATE_FIX subagent with `APPLY`
- **fix_needs_local_verify**: Spawn FETCH_HEAVY subagent for fix details before local verification
- **fix_needs_review**: Spawn FETCH_HEAVY subagent → get `suggestedFixDescription`, `suggestedFixSummary`, `taskFailureSummaries`
- **fix_failed / no_fix**: Spawn FETCH_HEAVY subagent → get `taskFailureSummaries` for local fix context
- **environment_issue**: Spawn UPDATE_FIX subagent with `RERUN_ENVIRONMENT_STATE`
- **self_healing_throttled**: Spawn FETCH_HEAVY subagent → get `selfHealingSkipMessage`; then FETCH_THROTTLE_INFO + UPDATE_FIX for each old fix

### Step 3a: Track State for New-CI-Attempt Detection

After actions that should trigger a new CI Attempt, record state before looping:

| Action                              | What to Track                                 | Next Mode |
| ----------------------------------- | --------------------------------------------- | --------- |
| Fix auto-applying                   | `last_cipe_url = current cipeUrl`             | Wait mode |
| Apply via MCP                       | `last_cipe_url = current cipeUrl`             | Wait mode |
| Apply locally + push                | `expected_commit_sha = $(git rev-parse HEAD)` | Wait mode |
| Reject + fix + push                 | `expected_commit_sha = $(git rev-parse HEAD)` | Wait mode |
| Fix failed + local fix + push       | `expected_commit_sha = $(git rev-parse HEAD)` | Wait mode |
| No fix + local fix + push           | `expected_commit_sha = $(git rev-parse HEAD)` | Wait mode |
| Environment rerun                   | `last_cipe_url = current cipeUrl`             | Wait mode |
| No-new-CI-Attempt + auto-fix + push | `expected_commit_sha = $(git rev-parse HEAD)` | Wait mode |
| CI Attempt no tasks + retry push    | `expected_commit_sha = $(git rev-parse HEAD)` | Wait mode |

Set `wait_mode = true`, reset `poll_count = 0`, then go to Step 2.

### Step 4: Cycle Classification and Progress Tracking

#### Cycle Classification

Not all cycles are equal. Only count cycles the monitor itself triggered toward `--max-cycles`:

1. **After decision script returns `done`**, check `agent_triggered`:
   - `agent_triggered == true` → this cycle was triggered by the monitor → `cycle_count++`
   - `agent_triggered == false` → this cycle was human-initiated or a first observation → do NOT increment `cycle_count`
2. **Reset** `agent_triggered = false`
3. **After Step 3a** (when the monitor takes an action that triggers a new CI Attempt) → set `agent_triggered = true`

**How detection works**: Step 3a is only called when the monitor explicitly pushes code, applies a fix via MCP, or triggers an environment rerun. If a human pushes on their own, the script detects a new CI Attempt but the monitor never went through Step 3a, so `agent_triggered` remains `false`.

**When a human-initiated cycle is detected**, log it:

Log that a human-initiated push was detected, monitoring continues without incrementing cycle count.

#### Approaching Limit Gate

When `cycle_count >= max_cycles - 2`, pause and ask the user before continuing:

Ask user whether to continue (with 5 or 10 more cycles) or stop monitoring. Increase `max_cycles` by user's choice.

#### Progress Tracking

- `no_progress_count` and circuit breaker are handled by the decision script
- Reset `no_progress_count` only when: `cipeStatus` changes (e.g. IN_PROGRESS → FAILED) OR a new CI Attempt is detected. Do NOT reset on superficial changes like different error messages within the same status.
- On new CI Attempt detected → reset `local_verify_count = 0`, reset `environment_rerun_count = 0`
- On non-`environment_issue` status → reset `environment_rerun_count = 0`

## User Instruction Examples

Users can override default behaviors:

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

### Environment vs Code Failure Recognition

When any local fix path runs a task and it fails, assess whether the failure is a **code issue** or an **environment/tooling issue** before consuming a `local_verify_count` attempt.

**Indicators of environment/tooling failures** (non-exhaustive): command not found / binary missing, OOM / heap allocation failures, permission denied, network timeouts / DNS failures, missing system libraries, Docker/container issues, disk space exhaustion.

When detected → bail immediately without incrementing `local_verify_count`. Report that the failure is an environment/tooling issue, not a code bug.

**Code failures** (compilation errors, test assertion failures, lint violations, type errors) are genuine candidates for local fix attempts and proceed normally through the budget.

## Error Handling

| Error                          | Action                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Git rebase conflict            | Report to user, exit                                                                                        |
| `nx-cloud apply-locally` fails | Reject fix via MCP (`action: "REJECT"`), then attempt manual patch (Reject + Fix From Scratch Flow) or exit |
| MCP tool error                 | Retry once, if fails report to user                                                                         |
| Subagent spawn failure         | Retry once, if fails exit with error                                                                        |
| Decision script error          | Treat as `error` status, increment `no_progress_count`                                                      |
| No new CI Attempt detected     | If `--auto-fix-workflow`, try lockfile update; otherwise report to user with guidance                       |
| Lockfile auto-fix fails        | Report to user, exit with guidance to check CI logs                                                         |
