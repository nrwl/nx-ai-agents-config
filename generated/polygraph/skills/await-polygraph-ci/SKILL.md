---
name: await-polygraph-ci
description: Wait for CI to settle across all repos in a Polygraph session, then report results and investigate failures. USE WHEN user says "await polygraph", "wait for polygraph ci", "polygraph ci status", "check polygraph ci", "watch polygraph session", "monitor polygraph".
user-invocable: true
allowed-tools:
  - Bash
  - Read
  - Task
  - AskUserQuestion
  - mcp__plugin_nx_nx-mcp__ci_information
  - mcp__plugin_nx_nx-mcp__update_self_healing_fix
---

---

name: await-polygraph-ci
description: Wait for CI to settle across all repos in a Polygraph session, then report results and investigate failures. USE WHEN user says "await polygraph", "wait for polygraph ci", "polygraph ci status", "check polygraph ci", "watch polygraph session", "monitor polygraph".

---

# Await Polygraph CI

Wait for all CI pipelines in a Polygraph session to reach a stable state (succeeded, failed, etc.), then produce a unified summary. If any pipelines failed, investigate via child agents and present fix options.

## Phase 1: Session Setup

Fetch the Polygraph session using `cloud_polygraph_get_session`.

**Parameters:**

- `sessionId` (required): The Polygraph session ID

```
cloud_polygraph_get_session(sessionId: "<session-id>")
```

1. Record `monitorStartedAt` = current timestamp (epoch millis).
2. Build a tracking table of all repos with PRs. For each PR, record:
   - `repo`: repository name
   - `prUrl`: PR URL
   - `prStatus`: DRAFT / OPEN / MERGED / CLOSED
   - `ciStatus`: from session (may already be a terminal status from a previous run)
   - `cipeUrl`: CI pipeline URL (null if none)
   - `cipeCompletedAt`: `completedAt` from session (epoch millis, null if CIPE is active or absent)
   - `selfHealingStatus`: self-healing fix status (null if none)
   - `firstSeenAt`: current timestamp
3. If no PRs found, report "No PRs in session" and exit.
4. **Stale detection**: For each PR, determine if its CI status is **stale** — meaning it reflects a previous run, not a current one. A PR's CI status is stale if:
   - `cipeCompletedAt` is non-null AND `cipeCompletedAt < monitorStartedAt` (the CIPE finished before the monitor started)
   - Mark these PRs as `stale: true`
5. Display the initial status table, annotating stale PRs:
   ```
   backend: SUCCEEDED (stale) | frontend: SUCCEEDED (stale) | shared-lib: NOT_STARTED
   ```

## Phase 2: Polling Loop

**Configuration:**

- Timeout: 30 minutes total
- Backoff: 60s → 90s → 120s (cap)
- Circuit breaker: exit after 5 consecutive polls with no status change

**Each poll iteration:**

1. Call `cloud_polygraph_get_session(sessionId: <session-id>)`
2. Update each tracked PR from the session response: `ciStatus`, `cipeUrl`, `cipeCompletedAt`, and `selfHealingStatus`
3. **Clear stale flag**: If a PR was marked `stale: true` and its `cipeCompletedAt` has changed (or become null, meaning a new CIPE is active), clear the stale flag — this PR now has fresh CI data.
4. Display status update:
   ```
   [await-polygraph-ci] Poll #N | Elapsed: Xm | Repos: Y total, Z completed
    backend: SUCCEEDED | frontend: FAILED (self-healing: PENDING) | shared-lib: SUCCEEDED (stale)
   ```
   Include `selfHealingStatus` inline when non-null. Annotate stale PRs.
5. Check exclusion rule: if a PR has `prStatus: DRAFT` and `ciStatus: NOT_STARTED` for more than 5 minutes since `firstSeenAt`, mark it as `EXCLUDED` (DRAFT PRs may not trigger CI)
6. Check terminal conditions — a PR is terminal when:
   - It is NOT stale, AND:
     - CI status is `SUCCEEDED`, `CANCELED`, or `TIMED_OUT`, OR
     - CI status is `FAILED` AND there is no active self-healing (i.e., `selfHealingStatus` is null or a final state like `APPLIED`, `REJECTED`, `FAILED`)
   - A `FAILED` PR with `selfHealingStatus` indicating an in-progress fix (e.g., `PENDING`, `IN_PROGRESS`) is NOT terminal — keep polling to track the self-healing outcome
   - A **stale** PR is NOT terminal — keep polling until it gets a fresh CIPE or is excluded
7. **Stale timeout**: If a stale PR remains stale for more than 5 minutes, assume no new CI is expected for it. Clear the stale flag and treat its current status as final.
8. If all non-excluded PRs are terminal → proceed to Phase 3
9. If timeout or circuit breaker hit → proceed to Phase 3 with partial results
10. Otherwise → wait with backoff, then poll again

## Phase 3: Results Analysis

Categorize repos into: succeeded, failed, canceled, timed_out, excluded, in_progress (if timed out).

Display final summary table. When showing self-healing status, distinguish clearly between these states:

- `COMPLETED` = a fix was **generated and verified**, but **NOT yet applied**. Display as `fix available`.
- `APPLIED` = the fix was **applied** by the user or agent. Display as `fix applied, awaiting re-run`.
- `IN_PROGRESS` / `PENDING` = the fix is still being generated. Display as `in progress`.
- `REJECTED` = the fix was rejected. Display as `fix rejected`.
- `FAILED` = self-healing failed to produce a fix. Display as `fix failed`.

```
[await-polygraph-ci] Final Results | Elapsed: Xm
 SUCCEEDED: backend, shared-lib
 FAILED: frontend (self-healing: fix available)
 EXCLUDED: docs (DRAFT, no CI)
```

Include self-healing status for any repo that has one.

- If all succeeded → report success and exit
- If any failed with `selfHealingStatus: APPLIED`, inform the user that the fix was applied and a CI re-run may be in progress or needed
- If any failed with `selfHealingStatus: COMPLETED`, inform the user that a fix is **available but not yet applied**, and offer to apply it
- If any failed → proceed to Phase 4

## Phase 4: Failure Investigation (Child Agent Delegation)

For each repo with `ciStatus: FAILED`, first check the CI data source from `ciStatus[prId]`:

- **If `cipeUrl` is non-null** → CIPE is authoritative. Delegate investigation using `ci_information`.
- **If `cipeUrl` is null but `externalCIRuns` exists** → external CI only. Examine failed jobs from `externalCIRuns` in the session data and use `cloud_ci_get_logs` for log retrieval.

1. Display known info from the session data before delegating:

   ```
   Repository: frontend
   CI Source: <CIPE or External CI (GitHub Actions)>
   CI Pipeline: <cipeUrl from session, or GitHub Actions run URL>
   Self-healing: <selfHealingStatus from session, or "None">
   Investigating failure details...
   ```

2. **Delegate investigation** (non-blocking) — call `cloud_polygraph_delegate` for each failed repo:

   - `sessionId`: the session ID
   - `target`: the repository name
   - `instruction` (when CIPE exists): Use the `ci_information` tool to investigate the CI failure on this branch. Return a structured summary with: (1) list of failed task IDs with a one-line error summary each, (2) failure category (Build / Test / Lint / E2E / Infra / Other).
   - `instruction` (when no CIPE, external CI only): The session data shows external CI failures with these failed jobs: [list jobId + name from `externalCIRuns[].jobs` where `conclusion` is `failure`]. Use `cloud_ci_get_logs(sessionId, workspaceId, jobId)` to save the log for each failed job to a local file, then use the `Read` tool to examine the log file contents. Return a structured summary with: (1) one-line error summary per failed job, (2) failure category (Build / Test / Lint / E2E / Infra / Other), (3) relevant log excerpts.
   - `context`: Polygraph session monitoring — investigating CI failure for unified summary. The workspace ID for this repo is available from the session data.

   Since `cloud_polygraph_delegate` is non-blocking, you can delegate to multiple failed repos in parallel.

3. **Monitor investigation progress** — poll `cloud_polygraph_child_status` to wait for each child agent to complete:

   ```
   cloud_polygraph_child_status(sessionId: "<session-id>", target: "frontend")
   ```

   Poll until the child agent's status indicates completion. Use the `tail` parameter to retrieve recent output lines containing the investigation results.

4. Collect each child agent's response from the status output. If a child agent fails or gets stuck, use `cloud_polygraph_stop_child` to terminate it and skip that repo.

5. Display failure summary for each repo:

   ```
   Repository: frontend
   CI Pipeline: <cipeUrl>
   Failed Tasks (2):
     - frontend:build → TypeScript error in src/app.tsx:42
     - frontend:test  → 3 test suites failed
   Category: Build + Test failures
   Self-healing: <selfHealingStatus>
   Job Logs: <number of logs retrieved, if any>
   ```

   If CI job logs were retrieved via `cloud_ci_get_logs`, include relevant excerpts (error messages, stack traces) in the summary. Keep excerpts concise — only the most relevant lines.

## Phase 5: Fix Planning

1. Group failures by category (Build, Test, Lint, E2E, Infra)
2. Identify cross-repo dependency issues (e.g., shared-lib build failure blocking frontend)
3. Suggest fix order based on dependency graph (upstream repos first)
4. Present next actions to the user based on self-healing status:
   - If any repo has `selfHealingStatus` with an available fix → offer to **apply self-healing** via `update_self_healing_fix(action: "APPLY")` or **reject** it
   - If self-healing was already applied → offer to **resume monitoring** to watch the re-triggered CI
   - **Delegate fixes**: use Polygraph to send fix instructions to child agents (for repos without self-healing or where self-healing was rejected/failed)
   - **Get more details**: drill into a specific repo's failure
   - **Exit**: done monitoring

## Notes

- This skill does NOT push code directly. The only write action it may take is applying/rejecting a self-healing fix via `update_self_healing_fix`, which is an Nx Cloud operation (not a local code change).
- Both `ci_information` and `update_self_healing_fix` responses include a `hints` array with contextual guidance (e.g., disclaimers about which CI Attempt was retrieved). Always check and surface non-empty hints.
- All heavy CI data inspection happens in child agents via `cloud_polygraph_delegate` to keep this context window clean.
- Child agents can use `cloud_ci_get_logs` to save CI job logs to local files, but ONLY when no CIPE exists for the PR (`ciStatus[prId].cipeUrl` is null). When a CIPE exists, logs come from the CIPE system via `ci_information`. Job IDs come from `ciStatus[prId].externalCIRuns[].jobs[].jobId` in the `get_session` response. The tool returns a file path (`logFile`) and size (`sizeBytes`) — use the `Read` tool to examine the log content. Logs can be large (100KB+), so only fetch logs for failed or relevant jobs.
- `cloud_polygraph_delegate` is **non-blocking** — it starts the child agent and returns immediately. Use `cloud_polygraph_child_status` to poll for results and `cloud_polygraph_stop_child` to terminate stuck agents.
- The `cloud_polygraph_get_session` response is compact and safe to poll from the main agent.
