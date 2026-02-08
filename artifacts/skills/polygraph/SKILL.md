---
name: polygraph
description: Guidance for coordinating changes across multiple repositories using Polygraph. When the request implies that some information from another repo has to be read, another repo has to be updated, or the user asks about what other repos are doing with shared code/APIs/endpoints, use this skill.
---

# Multi-Repo Coordination with Polygraph

This skill provides guidance for working on features that span multiple repositories using Polygraph for coordination.

## When to Use This Skill

- Working on a feature that affects another repository
- Need to coordinate changes, branches, and PRs across multiple repos
- Want to delegate tasks to child agents in different repositories
- User asks about what other repositories are doing (e.g., "what repos use this endpoint?")
- User mentions "other repos" in relation to shared code, APIs, or dependencies
- Need to discover or research how code is consumed across repositories

## Trigger Phrases

This skill applies when the user mentions:

- "other repos", "other repositories"
- "who uses this", "what uses this", "what are they doing"
- "cross-repo", "multi-repo"
- "consuming this API/endpoint"
- "dependent repositories"

## Available Tools

**CRITICAL:** These are **MCP tool function calls**, NOT CLI commands. You MUST invoke them as tool calls (the same way you call `Read`, `Edit`, `Bash`, etc.). Do NOT run them via Bash, `npx`, `nx`, or any CLI.

The tools have one of two MCP prefixes. Try the first prefix, and if it fails, use the second:

**Prefix 1:** `mcp__nx-mcp__`
**Prefix 2:** `mcp__plugin_nx_nx-mcp__`

| Tool Name (use with prefix above) | Description                                                             |
| --------------------------------- | ----------------------------------------------------------------------- |
| `cloud_polygraph_init`            | Initialize Polygraph for the Nx Cloud workspace                         |
| `cloud_polygraph_delegate`        | Start a task in a child agent in a dependent repository (non-blocking)  |
| `cloud_polygraph_child_status`    | Get the status and recent output of child agents in a Polygraph session |
| `cloud_polygraph_stop_child`      | Stop a running child agent in a Polygraph session                       |
| `cloud_polygraph_push_branch`     | Push a local git branch to the remote repository                        |
| `cloud_polygraph_create_prs`      | Create draft pull requests with session metadata linking related PRs    |
| `cloud_polygraph_get_session`     | Query status of the current polygraph session                           |
| `cloud_polygraph_mark_ready`      | Mark draft PRs as ready for review                                      |

### How to invoke these tools

These are MCP tool calls. Invoke them the same way you invoke `Read`, `Bash`, `Grep`, or any other tool — as a **function call**, not a shell command.

**Correct — MCP tool function call:**

```
mcp__nx-mcp__cloud_polygraph_init(setSessionId: "my-session")
mcp__nx-mcp__cloud_polygraph_delegate(sessionId: "...", target: "repo", instruction: "...")
mcp__nx-mcp__cloud_polygraph_child_status(sessionId: "...", target: "repo")
mcp__nx-mcp__cloud_polygraph_stop_child(sessionId: "...", target: "repo")
```

**WRONG — Do NOT do any of these:**

```
# ❌ Do NOT run as a Bash/CLI command
npx nx mcp cloud_polygraph_init
nx run cloud_polygraph_init
bash: mcp__nx-mcp__cloud_polygraph_init

# ❌ Do NOT wrap in a Task agent or subagent
Task(prompt: "call cloud_polygraph_init")
```

If the first prefix fails, retry with the second prefix:

```
mcp__plugin_nx_nx-mcp__cloud_polygraph_init(setSessionId: "my-session")
```

## Workflow Overview

1. **Initialize Polygraph session** - Use `cloud_polygraph_init` to set up the session.
2. **Delegate work to each repo** - Use `cloud_polygraph_delegate` to start child agents in other repositories (returns immediately).
3. **Monitor child agents** - Use `cloud_polygraph_child_status` to poll progress and get output from child agents.
4. **Stop child agents** (if needed) - Use `cloud_polygraph_stop_child` to terminate a running child agent.
5. **Push branches** - Use `cloud_polygraph_push_branch` after making commits.
6. **Create draft PRs** - Use `cloud_polygraph_create_prs` to create linked draft PRs.
7. **Query PR status** - Use `cloud_polygraph_get_session` to check progress.
8. **Mark PRs ready** - Use `cloud_polygraph_mark_ready` when work is complete.

## Step-by-Step Guide

### 1. Initialize Polygraph Session

- Current branch name: !`git branch --show-current`

First, initialize a Polygraph session:

```
cloud_polygraph_init()
```

The session ID is provided by the user:

1. The `setSessionId` parameter if provided AND it should be equal to the local branch name. If the branch is main, master, dev, ask the user to provide a Polygraph session id and use it during the session.

**After initialization, immediately print the session details.** Call `cloud_polygraph_get_session` and display:

**Session:** POLYGRAPH_SESSION_URL

**Repositories in this session:**

| Repo | Local Path |
| ---- | ---------- |
| REPO_FULL_NAME | LOCAL_PATH |

- REPO_FULL_NAME: from `workspaces[].vcsConfiguration.repositoryFullName`
- LOCAL_PATH: the absolute path to the local clone of the repo. For the initiator workspace, this is the current working directory. For other workspaces, the path is available from `cloud_polygraph_child_status`.
- POLYGRAPH_SESSION_URL: from `polygraphSessionUrl`

### 2. Delegate Work to Each Repository

Use `cloud_polygraph_delegate` to start a child Claude agent in another repository. **This call is non-blocking** — it starts the child agent and returns immediately with a confirmation message. The child agent runs in the background.

After delegating, use `cloud_polygraph_child_status` to monitor progress, and `cloud_polygraph_stop_child` to terminate a child if needed.

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `target` (required): Repository name or workspace ID to delegate to
- `instruction` (required): Task instruction for the child agent
- `context` (optional): Background context about the task

```
cloud_polygraph_delegate(
  sessionId: "<session-id>",
  target: "org/repo-name",  // or just "repo-name" or workspace ID
  instruction: "Add the new API endpoint for user preferences",
  context: "We're adding user preferences feature across repos"
)
// Returns immediately — child agent is now running in the background
```

You can delegate to multiple repos in parallel since each call returns immediately:

```
// Start work in multiple repos at the same time
cloud_polygraph_delegate(sessionId: "...", target: "frontend", instruction: "...")
cloud_polygraph_delegate(sessionId: "...", target: "backend", instruction: "...")

// Then monitor progress
cloud_polygraph_child_status(sessionId: "...")
```

ALWAYS USE `cloud_polygraph_delegate`. Don't interact with child repositories directly.

**CRITICAL — Branch Creation Requirement:** Every delegation instruction MUST explicitly tell the child agent to create and check out a new branch named `polygraph/<session-id>` as the VERY FIRST step before making any changes. If you omit this from the instruction, the child agent will commit directly to the default branch, which breaks the entire Polygraph workflow. Always include branch creation in your `instruction` parameter — do NOT rely on the child agent to do this on its own.

Example instruction that includes branch creation:

```
"First, create and check out a new branch named 'polygraph/<session-id>'. Then, <your actual task here>."
```

### 2a. Monitor Child Agent Progress

Use `cloud_polygraph_child_status` to check the status and recent output of child agents. Use this after delegating to monitor progress and determine when work is complete.

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `target` (optional): Repository name or workspace ID to get status for. If omitted, returns status for all child agents in the session.
- `tail` (optional): Number of recent output lines to return. Controls how much of the child agent's output you see.

```
// Get status of all child agents
cloud_polygraph_child_status(sessionId: "<session-id>")

// Get status of a specific child agent
cloud_polygraph_child_status(sessionId: "<session-id>", target: "org/repo-name")

// Get status with more output lines
cloud_polygraph_child_status(sessionId: "<session-id>", target: "org/repo-name", tail: 50)
```

**Polling strategy:**

Poll child agent status using the following backoff schedule:

1. **Immediately** — first check right after delegating
2. **10s** wait before second check
3. **30s** wait before third check
4. **60s** wait before fourth check and all subsequent checks

Use `sleep` in Bash between polls to enforce the wait intervals. Do NOT poll on every turn without waiting.

Always verify child agents have completed before proceeding to push branches and create PRs.

**Interpreting the logs:**

The `cloud_polygraph_child_status` response includes logs as newline-delimited JSON (NDJSON). Each line has a `type` field. Parse the last few lines to determine status and display a summary.

Key log entry types:

| `type` | Meaning | Useful fields |
|---|---|---|
| `system` (subtype: `init`) | Child agent started | `cwd` — working directory |
| `assistant` | Agent action — tool call or text output | `message.content[]` — array of `tool_use` or `text` blocks |
| `user` | Tool result returned to agent | `tool_use_result.stdout`, `tool_use_result.stderr` |
| `result` (subtype: `success` or `error`) | **Agent finished** | `result` — final text summary, `is_error` — whether it failed, `num_turns` — total turns taken |

**How to determine child status from logs:**

- **Completed successfully:** Last line has `type: "result"` with `subtype: "success"` and `is_error: false`
- **Completed with error:** Last line has `type: "result"` with `is_error: true`
- **Still running:** No `type: "result"` entry in the logs

**Display format for each poll:**

On each poll, display a one-line summary per child agent:

```
[polygraph] Poll #N | <repo>: <status> | <last activity>
```

Where:
- `<status>`: `running`, `completed`, or `failed`
- `<last activity>`: derived from the last `assistant` log entry:
  - If `tool_use`: show the tool name and a short description (e.g., `Bash("npm install")`, `Edit("src/app.ts")`, `Read("package.json")`)
  - If `text`: show a truncated snippet of the text (first 80 chars)
- When completed, show the `result` field from the final `type: "result"` entry instead of last activity

Examples:

```
[polygraph] Poll #1 | frontend: running | Read("src/components/App.tsx")
[polygraph] Poll #2 | frontend: running | Bash("nx run frontend:build")
[polygraph] Poll #3 | frontend: completed | "Added user preferences component and updated routing"
```

### 2b. Stop a Running Child Agent

Use `cloud_polygraph_stop_child` to terminate a running child agent. Use this if a child agent is stuck, taking too long, or if you need to cancel delegated work.

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `target` (required): Repository name or workspace ID of the child agent to stop

```
cloud_polygraph_stop_child(sessionId: "<session-id>", target: "org/repo-name")
```

**After stopping a child agent**, always print instructions for the user to continue work manually in the child repo. Get the repo path from the `cwd` field in the `system` init log entry (available via `cloud_polygraph_child_status`).

Display:

```
Child agent for <repo> has been stopped.

To continue the work manually, run:
  cd <path> && claude --continue
```

Where `<path>` is the absolute path to the child repo clone (e.g., `/var/folders/.../polygraph/<session-id>/<repo>`).

### 3. Create Branches with Session ID — MANDATORY

**THIS IS THE MOST CRITICAL STEP IN THE ENTIRE WORKFLOW.** Every child repo MUST have a branch created that matches the session ID. Without this, commits land on the default branch, PRs cannot be created, and the entire multi-repo coordination fails.

**YOU MUST:**

1. **Create the branch IMMEDIATELY after cloning** — before making ANY code changes
2. **Include branch creation in EVERY `cloud_polygraph_delegate` instruction** — never assume the child agent will do it automatically
3. **Use the exact naming convention** shown below

Branch naming convention:

```
polygraph/<session-id>
```

Example:

```
polygraph/add-user-preferences
```

**FAILURE TO CREATE BRANCHES IS THE #1 CAUSE OF POLYGRAPH SESSION FAILURES.** Always verify that branch creation is part of every delegation instruction you send.

### 4. Push Branches

Once work is complete in a repository, push the branch using `cloud_polygraph_push_branch`. This must be done before creating a PR.

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `repoPath` (required): Absolute file system path to the local git repository
- `branch` (required): Branch name to push to remote

```
cloud_polygraph_push_branch(
  sessionId: "<session-id>",
  repoPath: "/path/to/cloned/repo",
  branch: "polygraph/abc123/add-user-preferences"
)
```

### 5. Create Draft PRs

Create PRs for all repositories at once using `cloud_polygraph_create_prs`. PRs are created as drafts with session metadata that links related PRs across repos. Branches must be pushed first.

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `prs` (required): Array of PR specifications, each containing:
  - `owner` (required): GitHub repository owner
  - `repo` (required): GitHub repository name
  - `title` (required): PR title
  - `body` (required): PR description (session metadata is appended automatically)
  - `branch` (required): Branch name that was pushed

```
cloud_polygraph_create_prs(
  sessionId: "<session-id>",
  prs: [
    {
      owner: "org",
      repo: "frontend",
      title: "feat: Add user preferences UI",
      body: "Part of multi-repo user preferences feature",
      branch: "polygraph/add-user-preferences"
    },
    {
      owner: "org",
      repo: "backend",
      title: "feat: Add user preferences API",
      body: "Part of multi-repo user preferences feature",
      branch: "polygraph/add-user-preferences"
    }
  ]
)
```

### 6. Get Current Polygraph Session

Check the status of a session using `cloud_polygraph_get_session`. Returns the full session state including workspaces, PRs, CI status, and the Polygraph session URL.

**Parameters:**

- `sessionId` (required): The Polygraph session ID

**Returns:**

- `session.sessionId`: The session ID
- `session.polygraphSessionUrl`: URL to the Polygraph session UI
- `session.workspaces[]`: Array of connected workspaces, each with:
  - `id`: Workspace ID
  - `name`: Workspace name
  - `defaultBranch`: Default branch (e.g., `main`)
  - `vcsConfiguration.repositoryFullName`: Full repo name (e.g., `org/repo`)
  - `vcsConfiguration.provider`: VCS provider (e.g., `GITHUB`)
  - `initiator`: Whether this workspace initiated the session
- `session.dependencyGraph`: Graph of workspace dependencies (`nodes` and `edges`)
- `session.pullRequests[]`: Array of PRs, each with:
  - `url`: PR URL
  - `branch`: Branch name
  - `baseBranch`: Target branch
  - `title`: PR title
  - `status`: One of `DRAFT`, `OPEN`, `MERGED`, `CLOSED`
  - `workspaceId`: Associated workspace ID
  - `relatedPRs`: Array of related PR URLs across repos
- `session.ciStatus`: CI pipeline status keyed by PR ID, each containing:
  - `status`: One of `SUCCEEDED`, `FAILED`, `IN_PROGRESS`, `NOT_STARTED` (null if no CIPE)
  - `cipeUrl`: URL to the CI pipeline execution details (null if no CIPE)
  - `completedAt`: Epoch millis timestamp, set only when the CIPE has completed (null otherwise)
  - `selfHealingStatus`: The self-healing fix status string from Nx Cloud's AI fix feature (null if no AI fix exists)

```
cloud_polygraph_get_session(sessionId: "<session-id>")
```

### 7. Mark PRs Ready

Once all changes are verified and ready to merge, use `cloud_polygraph_mark_ready` to transition PRs from DRAFT to OPEN status.

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `prUrls` (required): Array of PR URLs to mark as ready for review

```
cloud_polygraph_mark_ready(
  sessionId: "<session-id>",
  prUrls: [
    "https://github.com/org/frontend/pull/123",
    "https://github.com/org/backend/pull/456"
  ]
)
```

## Other Capabilities

### Print Polygraph Session Details

When asked to print polygraph session details, use `cloud_polygraph_get_session` and display in the following format:

**Session:** POLYGRAPH_SESSION_URL

| Repo           | PR                 | PR Status | CI Status | Self-Healing        | CI Link          |
| -------------- | ------------------ | --------- | --------- | ------------------- | ---------------- |
| REPO_FULL_NAME | [PR_TITLE](PR_URL) | PR_STATUS | CI_STATUS | SELF_HEALING_STATUS | [View](CIPE_URL) |

**Local paths:**

- REPO_FULL_NAME: LOCAL_PATH

- REPO_FULL_NAME: from `workspaces[].vcsConfiguration.repositoryFullName` (match workspace to PR via `workspaceId`)
- LOCAL_PATH: the absolute path to the local clone of the repo. For the initiator workspace, this is the current working directory. For delegated workspaces, the path is available from `cloud_polygraph_child_status`.
- PR_URL, PR_TITLE, PR_STATUS: from `pullRequests[]`
- CI_STATUS: from `ciStatus[prId].status`
- SELF_HEALING_STATUS: from `ciStatus[prId].selfHealingStatus` (omit or show `-` if null)
- CIPE_URL: from `ciStatus[prId].cipeUrl`
- POLYGRAPH_SESSION_URL: from `polygraphSessionUrl`

## Best Practices

1. **ALWAYS create branches before any changes** — Include `polygraph/<session-id>` branch creation as the first instruction in every delegation. This is non-negotiable.
2. **Use consistent branch names** across all repos with the session ID
3. **Delegate in parallel** — Since `cloud_polygraph_delegate` is non-blocking, delegate to multiple repos at once, then monitor all with `cloud_polygraph_child_status`
4. **Poll child status before proceeding** — Always verify child agents have completed via `cloud_polygraph_child_status` before pushing branches or creating PRs
5. **Link PRs in descriptions** - Reference related PRs in each PR body
6. **Keep PRs as drafts** until all repos are ready
7. **Test integration** before marking PRs ready
8. **Coordinate merge order** if there are deployment dependencies
9. **Always use `cloud_polygraph_delegate`**. Never try to interact with child repos directly.
10. **Use `cloud_polygraph_stop_child` to clean up** — Stop child agents that are stuck or no longer needed
