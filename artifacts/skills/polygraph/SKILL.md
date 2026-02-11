# Multi-Repo Coordination with Polygraph

**IMPORTANT:** NEVER `cd` into cloned repositories or access their files directly. ALWAYS use the `cloud_polygraph_delegate` tool to perform work in other repositories.

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
| `cloud_polygraph_associate_pr`    | Associate an existing PR with a Polygraph session                       |

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
```

**Note:** `cloud_polygraph_init`, `cloud_polygraph_get_session`, `cloud_polygraph_push_branch`, `cloud_polygraph_create_prs`, `cloud_polygraph_mark_ready`, and `cloud_polygraph_associate_pr` should be called directly as MCP tools (not wrapped in Task). However, `cloud_polygraph_delegate` and `cloud_polygraph_child_status` should be called via a background Task subagent as described in section 2.

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
7. **Associate existing PRs** (optional) - Use `cloud_polygraph_associate_pr` to link PRs created outside Polygraph.
8. **Query PR status** - Use `cloud_polygraph_get_session` to check progress.
9. **Mark PRs ready** - Use `cloud_polygraph_mark_ready` when work is complete.

## Step-by-Step Guide

### 1. Initialize Polygraph Session

- Current branch name: !`git branch --show-current`

First, initialize a Polygraph session:

```
cloud_polygraph_init()
```

The session ID is provided by the user:

1. The `setSessionId` parameter if provided AND it should be equal to the local branch name. If the branch is main, master, dev, ask the user to provide a Polygraph session id and use it during the session.

After calling `cloud_polygraph_init`, print the list of cloned repositories and their local paths so the user can see where each repo was cloned to.

**After initialization, immediately print the session details.** Call `cloud_polygraph_get_session` and display:

**Session:** POLYGRAPH_SESSION_URL

**Repositories in this session:**

| Repo           | Local Path |
| -------------- | ---------- |
| REPO_FULL_NAME | LOCAL_PATH |

- REPO_FULL_NAME: from `workspaces[].vcsConfiguration.repositoryFullName`
- LOCAL_PATH: the absolute path to the local clone of the repo. For the initiator workspace, this is the current working directory. For other workspaces, the path is available from `cloud_polygraph_child_status`.
- POLYGRAPH_SESSION_URL: from `polygraphSessionUrl`

### 2. Delegate Work to Each Repository

To delegate work to another repository, use the `Task` tool with `run_in_background: true` to launch a **background subagent** that handles the entire delegate-and-poll cycle. This keeps the noisy polling output hidden from the user — they only see a clean summary when the work completes.

**How it works:**

1. You launch a background `Task` subagent for each target repo
2. The subagent calls `cloud_polygraph_delegate` to start the child agent, then polls `cloud_polygraph_child_status` with backoff until completion
3. The subagent returns a summary of what happened
4. You can check progress anytime by reading the subagent's output file

**Launch a background subagent per repo:**

```
Task(
  subagent_type: "general-purpose",
  run_in_background: true,
  description: "Delegate to <repo-name>",
  prompt: """
    You are a Polygraph delegation monitor. Your job:

    1. Call `cloud_polygraph_delegate` with:
       - sessionId: "<session-id>"
       - target: "<org/repo-name>"
       - instruction: "<the task instruction>"
       - context: "<optional context>"

    2. Poll `cloud_polygraph_child_status` with:
       - sessionId: "<session-id>"
       - target: "<org/repo-name>"
       - tail: 5

       Use this backoff schedule:
       - Immediately after delegating
       - Wait 10s, then poll
       - Wait 30s, then poll
       - Wait 60s, then poll (repeat 60s intervals until done)

       Use `sleep` in Bash between polls.

    3. Parse the NDJSON logs to determine status:
       - Completed: last line has `type: "result"` with `subtype: "success"`
       - Failed: last line has `type: "result"` with `is_error: true`
       - Running: no `type: "result"` entry

    4. When done, return a summary: repo name, success/failure, and the `result` text from the final log entry.
  """
)
```

**Delegate to multiple repos in parallel** by launching multiple background Task subagents at the same time:

```
// Launch subagents for each repo — all return immediately
Task(run_in_background: true, ..., prompt: "...delegate to frontend...")
Task(run_in_background: true, ..., prompt: "...delegate to backend...")

// Check progress later by reading the output files
Read(output_file_from_task_1)
Read(output_file_from_task_2)
```

ALWAYS USE background Task subagents for delegation. Don't call `cloud_polygraph_delegate` or `cloud_polygraph_child_status` directly in the main conversation.

### 2a. Check on Background Subagents

Since delegation runs in background Task subagents, you can check progress by reading the output file returned when the Task was launched:

```
Read(output_file_path)
```

Or use Bash to see recent output:

```
Bash("tail -50 <output_file_path>")
```

If you need to check the raw child agent status directly (e.g., for debugging), you can call `cloud_polygraph_child_status` as an MCP tool:

```
cloud_polygraph_child_status(sessionId: "<session-id>", target: "org/repo-name", tail: 5)
```

Always verify all background subagents have completed before proceeding to push branches and create PRs.

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

### 3. Push Branches

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

### 4. Create Draft PRs

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

**After creating PRs**, always print the Polygraph session URL:

```
**Polygraph session:** POLYGRAPH_SESSION_URL
```

### 5. Get Current Polygraph Session

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

### 6. Mark PRs Ready

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

**After marking PRs as ready**, always print the Polygraph session URL so the user can easily access the session overview. Call `cloud_polygraph_get_session` and display:

```
**Polygraph session:** POLYGRAPH_SESSION_URL
```

Where `POLYGRAPH_SESSION_URL` is from `polygraphSessionUrl` in the response.

### 7. Associate Existing PRs

Use `cloud_polygraph_associate_pr` to link pull requests that were created outside of Polygraph (e.g., manually or by CI) to the current session. This is useful when PRs already exist for the branches in the session and you want Polygraph to track them.

Provide either a `prUrl` to associate a specific PR, or a `branch` name to find and associate PRs matching that branch across session workspaces.

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `prUrl` (optional): URL of an existing pull request to associate
- `branch` (optional): Branch name to find and associate PRs for

```
cloud_polygraph_associate_pr(
  sessionId: "<session-id>",
  prUrl: "https://github.com/org/repo/pull/123"
)
```

Or by branch:

```
cloud_polygraph_associate_pr(
  sessionId: "<session-id>",
  branch: "feature/my-changes"
)
```

**Returns** the list of PRs now associated with the session.

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

1. **Delegate via background subagents** — Use `Task(run_in_background: true)` for each repo delegation. This keeps polling noise out of the main conversation.
2. **Poll child status before proceeding** — Always verify child agents have completed via `cloud_polygraph_child_status` before pushing branches or creating PRs
3. **Link PRs in descriptions** - Reference related PRs in each PR body
4. **Keep PRs as drafts** until all repos are ready
5. **Test integration** before marking PRs ready
6. **Coordinate merge order** if there are deployment dependencies
7. **Always delegate via background Task subagents**. Never call `cloud_polygraph_delegate` directly in the main conversation.
8. **Use `cloud_polygraph_stop_child` to clean up** — Stop child agents that are stuck or no longer needed
