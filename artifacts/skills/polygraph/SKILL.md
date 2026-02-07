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

| Tool Name (use with prefix above) | Description                                                          |
| --------------------------------- | -------------------------------------------------------------------- |
| `cloud_polygraph_init`            | Initialize Polygraph for the Nx Cloud workspace                      |
| `cloud_polygraph_delegate`        | Delegate a task to a child Claude agent in a dependent repository    |
| `cloud_polygraph_push_branch`     | Push a local git branch to the remote repository                     |
| `cloud_polygraph_create_prs`      | Create draft pull requests with session metadata linking related PRs |
| `cloud_polygraph_get_session`     | Query status of the current polygraph session                        |
| `cloud_polygraph_mark_ready`      | Mark draft PRs as ready for review                                   |

### How to invoke these tools

These are MCP tool calls. Invoke them the same way you invoke `Read`, `Bash`, `Grep`, or any other tool — as a **function call**, not a shell command.

**Correct — MCP tool function call:**

```
mcp__nx-mcp__cloud_polygraph_init(setSessionId: "my-session")
mcp__nx-mcp__cloud_polygraph_delegate(sessionId: "...", target: "repo", instruction: "...")
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
2. **Delegate work to each repo** - Use `cloud_polygraph_delegate` to spawn child agents in other repositories.
3. **Push branches** - Use `cloud_polygraph_push_branch` after making commits.
4. **Create draft PRs** - Use `cloud_polygraph_create_prs` to create linked draft PRs.
5. **Query PR status** - Use `cloud_polygraph_get_session` to check progress.
6. **Mark PRs ready** - Use `cloud_polygraph_mark_ready` when work is complete.

## Step-by-Step Guide

### 1. Initialize Polygraph Session

- Current branch name: !`git branch --show-current`

First, initialize a Polygraph session:

```
cloud_polygraph_init()
```

The session ID is provided by the user:

1. The `setSessionId` parameter if provided AND it should be equal to the local branch name. If the branch is main, master, dev, ask the user to provide a Polygraph session id and use it during the session.

### 2. Delegate Work to Each Repository

Use `cloud_polygraph_delegate` to spawn a child Claude agent in another repository. The child agent will execute the task and return the result.

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
```

ALWAYS USE `cloud_polygraph_delegate`. Don't interact with child repositories directly.

### 3. Create Branches with Session ID

When beginning work in each repo, ask the child to create a branch that matches the session id of the parent.

Branch naming convention:

```
polygraph/<session-id>
```

Example:

```
polygraph/add-user-preferences
```

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

| Repo           | PR                 | PR Status | CI Status | Self-Healing     | CI Link          |
| -------------- | ------------------ | --------- | --------- | ---------------- | ---------------- |
| REPO_FULL_NAME | [PR_TITLE](PR_URL) | PR_STATUS | CI_STATUS | SELF_HEALING_STATUS | [View](CIPE_URL) |

**Local paths:**

- REPO_FULL_NAME: LOCAL_PATH

- REPO_FULL_NAME: from `workspaces[].vcsConfiguration.repositoryFullName` (match workspace to PR via `workspaceId`)
- LOCAL_PATH: the absolute path to the local clone of the repo. For the initiator workspace, this is the current working directory. For delegated workspaces, the path is returned by `cloud_polygraph_delegate`.
- PR_URL, PR_TITLE, PR_STATUS: from `pullRequests[]`
- CI_STATUS: from `ciStatus[prId].status`
- SELF_HEALING_STATUS: from `ciStatus[prId].selfHealingStatus` (omit or show `-` if null)
- CIPE_URL: from `ciStatus[prId].cipeUrl`
- POLYGRAPH_SESSION_URL: from `polygraphSessionUrl`

## Best Practices

1. **Use consistent branch names** across all repos with the session ID
2. **Link PRs in descriptions** - Reference related PRs in each PR body
3. **Keep PRs as drafts** until all repos are ready
4. **Test integration** before marking PRs ready
5. **Coordinate merge order** if there are deployment dependencies
6. **Always use `cloud_polygraph_delegate`**. Never try to interact with child repos directly.
