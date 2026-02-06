---
name: get-latest-ci
description: Fetch the latest CI pipeline execution for the current branch. Returns the most recent CIPE which may be completed, in progress, or null. Use when you need to review CI status, check failures, or inspect CI state.
---

# Get Latest CI Information

Fetch the latest CI pipeline execution for the current branch. This is a **one-shot fetch** — return results immediately. Do NOT poll, loop, or wait for status changes.

## Context

- **Current Branch:** !`git branch --show-current`
- **Current Commit:** !`git rev-parse --short HEAD`

## Step 0: Verify Nx Cloud Connection

Read `nx.json` at workspace root. Check for `nxCloudId` or `nxCloudAccessToken`.

If neither property exists, exit with:

```
Nx Cloud not connected. Unlock 70% faster CI and auto-fix broken PRs with https://nx.dev/nx-cloud
```

## Step 1: Fetch CI Status via Subagent

Spawn a `general-purpose` subagent using the Task tool. The subagent will call the MCP tool and return results. Do NOT attempt to fetch CI information yourself — always delegate to the subagent.

```
Task(
  subagent_type: "general-purpose",
  description: "Fetch latest CI status",
  prompt: "Fetch the latest CI pipeline execution status. Do NOT use Bash for this.

Use the mcp__nx-mcp__ci_information MCP tool (or mcp__plugin_nx_nx-mcp__ci_information) with these parameters:
  select: 'cipeStatus,cipeUrl,branch,commitSha,selfHealingStatus,verificationStatus,userAction,failedTaskIds,verifiedTaskIds,selfHealingEnabled,failureClassification,couldAutoApplyTasks,shortLink,confidence,confidenceReasoning'

Return ALL fields from the response as-is. Do not summarize or omit any fields.

If cipeStatus is FAILED and selfHealingStatus is COMPLETED or FAILED and there are failedTaskIds, make a SECOND call to the same MCP tool with:
  select: 'taskOutputSummary,suggestedFix,suggestedFixReasoning,suggestedFixDescription'

Return those fields too. Only return the first page — do not paginate."
)
```

## Step 2: Report Results

Based on the subagent's response, report to the user. Always include the CIPE URL when available.

### No CIPE found (null/empty response)

```
[get-latest-ci] No CI pipeline execution found for branch '<branch>'.
```

### CI Succeeded

```
[get-latest-ci] CI passed!
[get-latest-ci] URL: <cipeUrl>
[get-latest-ci] Commit: <commitSha>
```

### CI In Progress / Not Started

```
[get-latest-ci] CI is <IN_PROGRESS|NOT_STARTED>.
[get-latest-ci] URL: <cipeUrl>
[get-latest-ci] Commit: <commitSha>
```

If self-healing is also in progress, add:

```
[get-latest-ci] Self-healing: <selfHealingStatus> | Verification: <verificationStatus>
```

### CI Failed — With Self-Healing Fix Available

When `cipeStatus == 'FAILED'` AND `selfHealingStatus == 'COMPLETED'` AND `suggestedFix != null`:

```
[get-latest-ci] CI failed.
[get-latest-ci] URL: <cipeUrl>
[get-latest-ci] Commit: <commitSha>
[get-latest-ci] Failed tasks: <failedTaskIds>
[get-latest-ci]
[get-latest-ci] Self-healing fix available!
[get-latest-ci] Short link: <shortLink>
[get-latest-ci] Confidence: <confidence> — <confidenceReasoning>
[get-latest-ci] Verification: <verificationStatus>
[get-latest-ci] Auto-apply eligible: <couldAutoApplyTasks>
[get-latest-ci]
[get-latest-ci] Fix description: <suggestedFixDescription>
[get-latest-ci] Fix reasoning: <suggestedFixReasoning> (truncated to first page)
```

### CI Failed — Self-Healing In Progress

When `cipeStatus == 'FAILED'` AND `selfHealingStatus == 'IN_PROGRESS'`:

```
[get-latest-ci] CI failed. Self-healing is generating a fix...
[get-latest-ci] URL: <cipeUrl>
[get-latest-ci] Commit: <commitSha>
[get-latest-ci] Failed tasks: <failedTaskIds>
[get-latest-ci]
[get-latest-ci] Use /monitor-ci to wait for the fix and apply it.
```

### CI Failed — Self-Healing Failed or Not Available

When `cipeStatus == 'FAILED'` AND (`selfHealingStatus` is `FAILED`, `NOT_EXECUTABLE`, or `null`):

```
[get-latest-ci] CI failed.
[get-latest-ci] URL: <cipeUrl>
[get-latest-ci] Commit: <commitSha>
[get-latest-ci] Failed tasks: <failedTaskIds>
[get-latest-ci] Self-healing: <selfHealingStatus or "not available">
[get-latest-ci] Classification: <failureClassification>
```

If `taskOutputSummary` was fetched, include a brief summary of failures.

### CI Failed — Environment Issue

When `failureClassification == 'ENVIRONMENT_STATE'`:

```
[get-latest-ci] CI failed due to environment issue.
[get-latest-ci] URL: <cipeUrl>
[get-latest-ci] Classification: ENVIRONMENT_STATE
[get-latest-ci]
[get-latest-ci] Use /monitor-ci to request an environment rerun.
```

### CI Canceled / Timed Out

```
[get-latest-ci] CI was <CANCELED|TIMED_OUT>.
[get-latest-ci] URL: <cipeUrl>
[get-latest-ci] Commit: <commitSha>
```

### CI Failed — No Tasks Recorded

When `cipeStatus == 'FAILED'` AND `failedTaskIds` is empty AND `selfHealingStatus` is null:

```
[get-latest-ci] CI failed but no Nx tasks were recorded (likely infrastructure issue).
[get-latest-ci] URL: <cipeUrl>
[get-latest-ci] Check CI provider logs for details.
```

## Important

- This skill is **read-only**. Do NOT apply fixes, push code, or modify anything.
- Always delegate the MCP call to a subagent. Do NOT call ci_information yourself.
- If the user wants to act on the results (apply a fix, monitor, etc.), suggest `/monitor-ci`.
- If the subagent returns an error, report it and suggest the user check their Nx Cloud connection.
