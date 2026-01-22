---
description: 'Monitor Nx Cloud CI pipeline and handle self-healing fixes automatically'
argument-hint: '[instructions] [--max-cycles N] [--timeout MINUTES] [--verbosity minimal|medium|verbose] [--branch BRANCH] [--fresh] [--auto-fix-workflow] [--new-cipe-timeout MINUTES]'
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Task
  - mcp__nx__ci_information
  - mcp__nx__update_self_healing_fix
---

# Nx CI Monitor Command

Orchestrate CIPE monitoring via `nx-ci-monitor` subagent. Handle self-healing fixes.

## Context

- **Branch:** !`git branch --show-current`
- **Commit:** !`git rev-parse --short HEAD`
- **Remote:** !`git status -sb | head -1`

## User Instructions

$ARGUMENTS

User instructions override defaults below.

## Configuration Defaults

| Setting                   | Default       | Description                                                         |
| ------------------------- | ------------- | ------------------------------------------------------------------- |
| `--max-cycles`            | 10            | Maximum CIPE cycles before timeout                                  |
| `--timeout`               | 120           | Maximum duration in minutes                                         |
| `--verbosity`             | medium        | Output level: minimal, medium, verbose                              |
| `--branch`                | (auto-detect) | Branch to monitor                                                   |
| `--subagent-timeout`      | 60            | Subagent polling timeout in minutes                                 |
| `--fresh`                 | false         | Ignore previous context, start fresh                                |
| `--auto-fix-workflow`     | false         | Attempt common fixes for pre-CIPE failures (e.g., lockfile updates) |
| `--new-cipe-timeout`      | 30            | Minutes to wait for new CIPE after action                           |
| `--local-verify-attempts` | 3             | Max local verification + enhance cycles before pushing to CI        |

Parse overrides from `$ARGUMENTS`.

## Session Context

Context persists across Ctrl+C. Use `--fresh` to reset. Exit Claude for clean slate.

## Status Behaviors

| Status                           | Action                                                                                 |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `ci_success`                     | Exit success                                                                           |
| `fix_auto_applying`              | Don't call MCP. Record `last_cipe_url`, spawn wait-mode subagent                       |
| `fix_available`                  | See **Fix Available Logic** below                                                      |
| `fix_failed`                     | Attempt local fix → commit, push, loop. Else exit failure                              |
| `environment_issue`              | Call `update_self_healing_fix({ shortLink, action: "RERUN_ENVIRONMENT_STATE" })`, loop |
| `no_fix`                         | Attempt local fix or exit failure                                                      |
| `no_new_cipe`                    | Report to user. If `--auto-fix-workflow` → try lockfile update, push, loop. Else exit  |
| `polling_timeout`                | Exit timeout                                                                           |
| `cipe_canceled`/`cipe_timed_out` | Exit                                                                                   |
| `error`                          | `no_progress_count++`. If >= 3 → exit. Else wait 60s, loop                             |

### Fix Available Logic

Compare `failedTaskIds` vs `verifiedTaskIds`:

**Categorize:**

- Verified = in both arrays
- Unverified = in `failedTaskIds` only
- E2E = unverified with "e2e" in target (`<project>:<target>` or `<project>:<target>:<config>`)
- Verifiable = unverified, non-e2e

**Path:**
| Condition | Action |
|-----------|--------|
| All verified OR only e2e unverified | Apply via MCP |
| Verifiable tasks exist | Local verification |

**Local Verification:**

1. Detect PM: `pnpm-lock.yaml` → `pnpm nx`, `yarn.lock` → `yarn nx`, else `npx nx`
2. Spawn `general` subagents to run `<pm> nx run <taskId>` in parallel
3. All pass → Apply via MCP
4. Any fail → `nx apply-locally <shortLink>`, enhance, verify again
   - Still failing → increment `local_verify_count`, loop back to enhance
   - Passing → commit, push

**Attempt Tracking** (wraps step 4):

- Increment `local_verify_count` after each enhance cycle
- If >= `--local-verify-attempts` (default: 3): commit current state, push to CI as final judge

### Unverified Fix (No Verification Attempted)

When `verificationStatus` = `FAILED`/`NOT_EXECUTABLE` or no auto-apply:

- Analyze fix content → apply via MCP if correct
- Needs enhancement → apply-locally, enhance, push
- Wrong → reject via MCP, fix from scratch, push

### Actions Reference

| Action        | Command                                                                                  |
| ------------- | ---------------------------------------------------------------------------------------- |
| Apply via MCP | `update_self_healing_fix({ shortLink, action: "APPLY" })`                                |
| Apply locally | `nx apply-locally <shortLink>` (fallback: `nx-cloud apply-locally <shortLink>`)          |
| Reject        | `update_self_healing_fix({ shortLink, action: "REJECT" })`                               |
| Commit + push | `git add -A && git commit -m "fix: ..." && git push origin $(git branch --show-current)` |

## Exit Conditions

| Condition                      | Exit            |
| ------------------------------ | --------------- |
| `cipeStatus` = `SUCCEEDED`     | Success         |
| Max cycles/duration reached    | Timeout         |
| 3 consecutive no-progress      | Circuit breaker |
| No fix + no local fix possible | Failure         |

## Main Loop

**Init:** `cycle_count=0`, `no_progress_count=0`, `local_verify_count=0`, `last_cipe_url=null`, `expected_commit_sha=null`

**Spawn subagent:**

```
Task(agent: "nx-ci-monitor", prompt: "Branch: <branch>. Timeout: <timeout>m. Verbosity: <verbosity>.
[If wait mode:] WAIT MODE. Expected SHA: <sha>. Previous CIPE: <url>")
```

**Subagent returns:** Standard fields only + computed `selfHealingUrl`. No expensive fields (`suggestedFix`, `suggestedFixReasoning`, task outputs).

If expensive fields needed (rare):

```
ci_information({ branch, select: "suggestedFix" })
```

**On response:** Check status → execute action → if looping, track state for wait mode:

- MCP actions → `last_cipe_url = cipeUrl`
- Local push → `expected_commit_sha = $(git rev-parse HEAD)`

**Progress:** State changed → reset `no_progress_count`. Unchanged → increment. New CI attempt → reset `local_verify_count`.

## User Reporting

When reporting fix status:

- Brief: use `suggestedFixDescription`
- Details: link to `selfHealingUrl` ("View details: <url>")
- Do NOT dump diff or reasoning content

## Error Handling

| Error                    | Action                                                  |
| ------------------------ | ------------------------------------------------------- |
| Git conflict             | Report, exit                                            |
| `nx apply-locally` fails | Try `nx-cloud apply-locally`, else manual patch or exit |
| MCP/subagent error       | Retry once, then report                                 |

## Example Flow

```
[nx-ci-monitor] Monitoring branch 'feature/add-auth'...
[CI Monitor] CI: IN_PROGRESS → FAILED | Self-Healing: COMPLETED (5m)
[nx-ci-monitor] Fix available: "Update test assertion to match component output"
  View details: https://cloud.nx.app/cipes/.../self-healing
  Applying via MCP...
[CI Monitor] New CI attempt: SUCCEEDED (8m)
[nx-ci-monitor] Done. Cycles: 2, Time: 12m, Result: SUCCESS
```
