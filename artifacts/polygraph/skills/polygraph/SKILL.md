{%- assign has_subagents = false -%}
{%- if platform == "claude" or platform == "opencode" -%}{%- assign has_subagents = true -%}{%- endif -%}

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

| Tool Name (use with prefix above) | Description                                                                                                                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cloud_polygraph_candidates`      | Discover candidate workspaces with descriptions and graph relationships                                                                                                                                                                             |
| `cloud_polygraph_init`            | Initialize Polygraph for the Nx Cloud workspace                                                                                                                                                                                                     |
| `cloud_polygraph_delegate`        | Start a task in a child agent in a dependent repository (non-blocking)                                                                                                                                                                              |
| `cloud_polygraph_child_status`    | Get the status and recent output of child agents in a Polygraph session                                                                                                                                                                             |
| `cloud_polygraph_stop_child`      | Stop an in-progress child agent in a Polygraph session                                                                                                                                                                                              |
| `cloud_polygraph_push_branch`     | Push a local git branch to the remote repository                                                                                                                                                                                                    |
| `cloud_polygraph_create_prs`      | Create draft pull requests with session metadata linking related PRs                                                                                                                                                                                |
| `cloud_polygraph_get_session`     | Query status of the current polygraph session                                                                                                                                                                                                       |
| `cloud_polygraph_mark_ready`      | Mark draft PRs as ready for review                                                                                                                                                                                                                  |
| `cloud_polygraph_associate_pr`    | Associate an existing PR with a Polygraph session                                                                                                                                                                                                   |
| `cloud_polygraph_modify_session`  | Modify a running Polygraph session. Pass `addWorkspaceIds` to add workspaces for delegation, or pass `complete: true` to mark the session as completed (closes all open/draft PRs and seals it from further changes). These are mutually exclusive. |
| `cloud_ci_get_logs`               | Retrieve the full plain-text log for a specific CI job. Use `jobId` from CI run data. Only call for jobs where the run has completed                                                                                                                |

### How to invoke these tools

These are MCP tool calls. Invoke them the same way you invoke `Read`, `Bash`, `Grep`, or any other tool — as a **function call**, not a shell command.

**Correct — MCP tool function call:**

```
cloud_polygraph_init()
cloud_polygraph_delegate(sessionId: "...", target: "repo", instruction: "...")
cloud_polygraph_child_status(sessionId: "...", target: "repo")
cloud_polygraph_stop_child(sessionId: "...", target: "repo")
```

**WRONG — Do NOT do any of these:**

```
# ❌ Do NOT run as a Bash/CLI command
npx nx mcp cloud_polygraph_init
nx run cloud_polygraph_init
bash: cloud_polygraph_init
```

{%- if has_subagents %}

**Note:** `cloud_polygraph_candidates` and `cloud_polygraph_init` should be called via the `polygraph-init-subagent` as described in step 0. `cloud_polygraph_get_session`, `cloud_polygraph_push_branch`, `cloud_polygraph_create_prs`, `cloud_polygraph_mark_ready`, `cloud_polygraph_associate_pr`, and `cloud_polygraph_modify_session` should be called directly as MCP tools. `cloud_polygraph_delegate` and `cloud_polygraph_child_status` should be called via the `polygraph-delegate-subagent` as described in step 1.
{%- endif %}

If the first prefix fails, retry with the second prefix:

```
cloud_polygraph_init()
```

## Workflow Overview

{%- if has_subagents %}

0. **Initialize Polygraph session** - Launch the `polygraph-init-subagent` to discover candidate repos, select relevant workspaces, and initialize the session. The subagent returns a summary with session details.
1. **Delegate work to each repo** - Use the `polygraph-delegate-subagent` to start child agents in other repositories.
   {%- else %}
2. **Initialize Polygraph session** - Discover candidate repos, select relevant workspaces, and initialize the session via `cloud_polygraph_candidates` and `cloud_polygraph_init`.
3. **Delegate work to each repo** - Use `cloud_polygraph_delegate` to start child agents in other repositories (returns immediately).
   {%- endif %}
4. **Monitor child agents** - Use `cloud_polygraph_child_status` to poll progress and get output from child agents.
5. **Stop child agents** (if needed) - Use `cloud_polygraph_stop_child` to cancel an in-progress child agent.
6. **Push branches** - Use `cloud_polygraph_push_branch` after making commits.
7. **Create draft PRs** - Use `cloud_polygraph_create_prs` to create linked draft PRs. Both `plan` and `agentSessionId` are required.
8. **Associate existing PRs** (optional) - Use `cloud_polygraph_associate_pr` to link PRs created outside Polygraph.
9. **Query PR status** - Use `cloud_polygraph_get_session` to check progress.
10. **Mark PRs ready** - Use `cloud_polygraph_mark_ready` when work is complete.
11. **Complete session** - Use `cloud_polygraph_modify_session` with `complete: true` to mark the session as completed when the user requests it.

## Step-by-Step Guide

### 0. Initialize Polygraph Session

{%- if has_subagents %}

Use the `polygraph-init-subagent` to discover candidate repos, select relevant workspaces, and initialize the Polygraph session. The subagent handles calling `cloud_polygraph_candidates` and `cloud_polygraph_init` and returns a structured summary.
{%- else %}

Discover candidate repos using `cloud_polygraph_candidates`, select relevant workspaces, and initialize the Polygraph session using `cloud_polygraph_init`.
{%- endif %}

**Session ID is auto-generated:**

The `cloud_polygraph_init` tool automatically generates a unique session ID. You do NOT need to pass a session ID unless resuming an existing session.
{%- if platform == "claude" %}

**Launch the init subagent:**

{% raw %}

```
Task(
  subagent_type: "general-purpose",
  description: "Init Polygraph session",
  prompt: """
    You are a Polygraph init subagent. Follow the instructions in the polygraph-init-subagent agent definition.

    Parameters:
    - userContext: "<description of what the user wants to do>"

    Discover candidates, select relevant repos based on the user context, initialize the session, and return a structured summary.
  """
)
```

{% endraw %}
{%- elsif platform == "opencode" %}

**Launch the init subagent** using `@polygraph-init-subagent`:

Invoke the `polygraph-init-subagent` agent with the user context. The subagent handles calling `cloud_polygraph_candidates` and `cloud_polygraph_init` and returns a structured summary.
{%- else %}

Call `cloud_polygraph_candidates` to discover available workspaces, select relevant repos based on user context, then call `cloud_polygraph_init` with the selected workspace IDs.
{%- endif %}

The subagent will:

1. Call `cloud_polygraph_candidates` to discover available workspaces
2. Select relevant repos based on the user context (or include all if uncertain)
3. Call `cloud_polygraph_init` with the session ID and selected workspace IDs
4. Call `cloud_polygraph_get_session` to retrieve session details
5. Return a summary with session URL, repos, and workspace info

**After receiving the subagent's summary, print the session details:**

**Session:** POLYGRAPH_SESSION_URL

**Repositories in this session:**

| Repo           | Local Path |
| -------------- | ---------- |
| REPO_FULL_NAME | LOCAL_PATH |

- REPO_FULL_NAME: from `workspaces[].vcsConfiguration.repositoryFullName`
- LOCAL_PATH: the absolute path to the local clone of the repo. For the initiator workspace, this is the current working directory. For other workspaces, the path is available from `cloud_polygraph_child_status`.
- POLYGRAPH_SESSION_URL: from `polygraphSessionUrl`

### 1. Delegate Work to Each Repository

{%- if platform == "claude" %}

To delegate work to another repository, use the `Task` tool with `run_in_background: true` to launch a **background subagent** that handles the entire delegate-and-poll cycle. This keeps the noisy polling output hidden from the user — they only see a clean summary when the work completes.

**How it works:**

1. You launch a background `Task` subagent for each target repo
2. The subagent calls `cloud_polygraph_delegate` to start the child agent, then polls `cloud_polygraph_child_status` with backoff until completion
3. The subagent returns a summary of what happened
4. You can check progress anytime by reading the subagent's output file

**Launch a background subagent per repo** using the `polygraph-delegate-subagent`:

{% raw %}

```
Task(
  subagent_type: "general-purpose",
  run_in_background: true,
  description: "Delegate to <repo-name>",
  prompt: """
    You are a Polygraph delegate subagent. Follow the instructions in the polygraph-delegate-subagent agent definition.

    Parameters:
    - sessionId: "<session-id>"
    - target: "<org/repo-name>"
    - instruction: "<the task instruction>"
    - context: "<optional context>"

    Delegate the work, poll for completion, and return a structured summary.
  """
)
```

{% endraw %}

**Delegate to multiple repos in parallel** by launching multiple background Task subagents at the same time:

{% raw %}

```
// Launch subagents for each repo — all return immediately
Task(run_in_background: true, ..., prompt: "...delegate to frontend...")
Task(run_in_background: true, ..., prompt: "...delegate to backend...")

// Check progress later by reading the output files
Read(output_file_from_task_1)
Read(output_file_from_task_2)
```

{% endraw %}

ALWAYS USE background Task subagents for delegation. Don't call `cloud_polygraph_delegate` or `cloud_polygraph_child_status` directly in the main conversation.

### 1a. Check on Background Subagents

Since delegation runs in background Task subagents, you can check progress by reading the output file returned when the Task was launched:

{% raw %}

```
Read(output_file_path)
```

{% endraw %}

Or use Bash to see recent output:

{% raw %}

```
Bash("tail -50 <output_file_path>")
```

{% endraw %}

If you need to check the raw child agent status directly (e.g., for debugging), you can call `cloud_polygraph_child_status` as an MCP tool:

{% raw %}

```
cloud_polygraph_child_status(sessionId: "<session-id>", target: "org/repo-name", tail: 5)
```

{% endraw %}

Always verify all background subagents have completed before proceeding to push branches and create PRs.
{%- elsif platform == "opencode" %}

Use the `polygraph-delegate-subagent` agent (`@polygraph-delegate-subagent`) for each target repository. The subagent handles calling `cloud_polygraph_delegate` to start the child agent, then polls `cloud_polygraph_child_status` with backoff until completion, and returns a structured summary.

**For each target repo**, invoke `@polygraph-delegate-subagent` with:

- `sessionId`: The Polygraph session ID
- `target`: Repository name (e.g., `org/repo-name`)
- `instruction`: The task instruction for the child agent
- `context`: Optional additional context

**Delegate to multiple repos** by launching multiple `@polygraph-delegate-subagent` invocations.

### 1a. Check on Child Agents

Use `cloud_polygraph_child_status` to check progress:
{%- else %}

Use `cloud_polygraph_delegate` to start a child agent in each target repository. The call returns immediately — use `cloud_polygraph_child_status` to poll for completion with backoff.

**For each target repo:**

1. Call `cloud_polygraph_delegate` with `sessionId`, `target`, and `instruction`
2. Poll `cloud_polygraph_child_status` periodically until the child agent completes
3. Review the child agent's output before proceeding

**Delegate to multiple repos** by calling `cloud_polygraph_delegate` for each repo, then polling their status.

### 1a. Check on Child Agents

Use `cloud_polygraph_child_status` to check progress:

{% raw %}

```
cloud_polygraph_child_status(sessionId: "<session-id>", target: "org/repo-name", tail: 5)
```

{% endraw %}

Always verify all child agents have completed before proceeding to push branches and create PRs.
{%- endif %}

### 1b. Stop an In-Progress Child Agent

Use `cloud_polygraph_stop_child` to cancel an in-progress child agent. Use this if a child agent is stuck, taking too long, or if you need to cancel delegated work.

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `target` (required): Repository name or workspace ID of the child agent to stop

```
cloud_polygraph_stop_child(sessionId: "<session-id>", target: "org/repo-name")
```

**After stopping a child agent**, always print instructions for the user to continue work manually in the child repo. Get the repo path from the `cwd` field in the `system` init log entry (available via `cloud_polygraph_child_status`).

Display:

```
Child agent for <repo> has been cancelled.

To continue the work manually, run:
  cd <path> && claude --continue
```

Where `<path>` is the absolute path to the child repo clone (e.g., `/var/folders/.../polygraph/<session-id>/<repo>`).

### 2. Push Branches

Once work is complete in a repository, push the branch using `cloud_polygraph_push_branch`. This must be done before creating a PR.

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `repoPath` (required): Absolute file system path to the local git repository
- `branch` (required): Branch name to push to remote

```
cloud_polygraph_push_branch(
  sessionId: "<session-id>",
  repoPath: "/path/to/cloned/repo",
  branch: "polygraph/ad5fa-add-user-preferences"
)
```

### 3. Create Draft PRs

Create PRs for all repositories at once using `cloud_polygraph_create_prs`. PRs are created as drafts with session metadata that links related PRs across repos. Branches must be pushed first.

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `prs` (required): Array of PR specifications, each containing:
  - `owner` (required): GitHub repository owner
  - `repo` (required): GitHub repository name
  - `title` (required): PR title
  - `body` (required): PR description (session metadata is appended automatically)
  - `branch` (required): Branch name that was pushed
- `plan` (required): High-level plan describing the session's purpose. Both `plan` and `agentSessionId` must always be provided together to enable session resuming.
- `agentSessionId` (required): The Claude CLI session ID. Both `plan` and `agentSessionId` must always be provided together to enable session resuming.

```
cloud_polygraph_create_prs(
  sessionId: "<session-id>",
  plan: "Add user preferences feature: UI in frontend, API in backend",
  agentSessionId: "<claude-session-id>",
  prs: [
    {
      owner: "org",
      repo: "frontend",
      title: "feat: Add user preferences UI",
      body: "Part of multi-repo user preferences feature",
      branch: "polygraph/ad5fa-add-user-preferences"
    },
    {
      owner: "org",
      repo: "backend",
      title: "feat: Add user preferences API",
      body: "Part of multi-repo user preferences feature",
      branch: "polygraph/ad5fa-add-user-preferences"
    }
  ]
)
```

**After creating PRs**, always print the Polygraph session URL:

```
**Polygraph session:** POLYGRAPH_SESSION_URL
```

### 4. Get Current Polygraph Session

Check the status of a session using `cloud_polygraph_get_session`. Returns the full session state including workspaces, PRs, CI status, and the Polygraph session URL.

**Parameters:**

- `sessionId` (required): The Polygraph session ID

**Returns:**

- `session.sessionId`: The session ID
- `session.polygraphSessionUrl`: URL to the Polygraph session UI
- `session.plan`: High-level plan describing what this session is doing (null if not set)
- `session.agentSessionId`: The Claude CLI session ID that can be used to resume the session (null if not set)
- `session.workspaces[]`: Array of connected workspaces, each with:
  - `id`: Workspace ID
  - `name`: Workspace name
  - `defaultBranch`: Default branch (e.g., `main`)
  - `vcsConfiguration.repositoryFullName`: Full repo name (e.g., `org/repo`)
  - `vcsConfiguration.provider`: VCS provider (e.g., `GITHUB`)
  - `workspaceDescription`: AI-generated description of what this workspace does (may be null)
  - `initiator`: Whether this workspace initiated the session
- `session.dependencyGraph`: Graph of workspace dependency `edges`
- `session.pullRequests[]`: Array of PRs, each with:
  - `url`: PR URL
  - `branch`: Branch name
  - `baseBranch`: Target branch
  - `title`: PR title
  - `status`: One of `DRAFT`, `OPEN`, `MERGED`, `CLOSED`
  - `workspaceId`: Associated workspace ID
  - `relatedPRs`: Array of related PR URLs across repos
- `session.ciStatus`: CI pipeline status keyed by PR ID, each containing:
  - `status`: One of `SUCCEEDED`, `FAILED`, `IN_PROGRESS`, `NOT_STARTED` (null if no CIPE and no external CI)
  - `cipeUrl`: URL to the CI pipeline execution details (null if no CIPE)
  - `completedAt`: Epoch millis timestamp, set only when the CIPE has completed (null otherwise)
  - `selfHealingStatus`: The self-healing fix status string from Nx Cloud's AI fix feature (null if no AI fix exists)
  - `externalCIRuns`: Array of external CI runs (present when no CIPE but external CI data exists, e.g., GitHub Actions). Each run contains:
    - `runId`: GitHub Actions run ID
    - `name`: Workflow name
    - `status`: Run status (`completed`, `in_progress`, `queued`)
    - `conclusion`: Run conclusion (`success`, `failure`, `cancelled`, `timed_out`, or null)
    - `url`: GitHub Actions run URL
    - `jobs`: Array of jobs in the run, each with:
      - `jobId`: Job ID (use with `cloud_ci_get_logs`)
      - `name`: Job name
      - `status`: Job status
      - `conclusion`: Job conclusion (or null)

```
cloud_polygraph_get_session(sessionId: "<session-id>")
```

### 5. Mark PRs Ready

Once all changes are verified and ready to merge, use `cloud_polygraph_mark_ready` to transition PRs from DRAFT to OPEN status.

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `prUrls` (required): Array of PR URLs to mark as ready for review
- `plan` (required): High-level plan describing the session's purpose. Both `plan` and `agentSessionId` must always be provided together to enable session resuming.
- `agentSessionId` (required): The Claude CLI session ID. Both `plan` and `agentSessionId` must always be provided together to enable session resuming.

```
cloud_polygraph_mark_ready(
  sessionId: "<session-id>",
  plan: "Add user preferences feature: UI in frontend, API in backend",
  agentSessionId: "<claude-session-id>",
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

### 6. Associate Existing PRs

Use `cloud_polygraph_associate_pr` to link pull requests that were created outside of Polygraph (e.g., manually or by CI) to the current session. This is useful when PRs already exist for the branches in the session and you want Polygraph to track them.

Provide either a `prUrl` to associate a specific PR, or a `branch` name to find and associate PRs matching that branch across session workspaces.

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `prUrl` (optional): URL of an existing pull request to associate
- `branch` (optional): Branch name to find and associate PRs for
- `plan` (required): High-level plan describing the session's purpose. Both `plan` and `agentSessionId` must always be provided together to enable session resuming.
- `agentSessionId` (required): The Claude CLI session ID. Both `plan` and `agentSessionId` must always be provided together to enable session resuming.

```
cloud_polygraph_associate_pr(
  sessionId: "<session-id>",
  plan: "Add user preferences feature: UI in frontend, API in backend",
  agentSessionId: "<claude-session-id>",
  prUrl: "https://github.com/org/repo/pull/123"
)
```

Or by branch:

```
cloud_polygraph_associate_pr(
  sessionId: "<session-id>",
  plan: "Add user preferences feature: UI in frontend, API in backend",
  agentSessionId: "<claude-session-id>",
  branch: "feature/my-changes"
)
```

**Returns** the list of PRs now associated with the session.

### 7. Complete Session

**IMPORTANT: Only call this tool when the user explicitly asks to complete or close the session.** Do not automatically complete sessions as part of the workflow.

**⚠️ Warning:** Completing a session is a **destructive action**. It will close all associated open and draft PRs. Only complete a session when the user explicitly confirms they want to close all PRs and seal the session.

Use `cloud_polygraph_modify_session` with `complete: true` to mark the session as completed. Completing a session will:

- **Mark the session as completed** and sealed from further modifications (no new PRs, status changes, etc.)
- **Close all open and draft PRs** associated with the session
- Return a `closedPRs` list in the response showing which PRs were closed and whether each close succeeded

This is idempotent — completing an already-completed session returns success.

**Parameters:**

- `sessionId` (required): The Polygraph session ID

**Returns:**

- `sessionId`: The session ID
- `completed`: Boolean indicating completion status
- `closedPRs`: Array of objects for each PR that was closed, each containing:
  - `url`: The PR URL
  - `success`: Boolean indicating whether the close succeeded
  - `error` (optional): Error message if the close failed

```
cloud_polygraph_modify_session(
  sessionId: "<session-id>",
  complete: true
)
```

**When to call:**

- After all cross-repo work is finished
- All PRs have been created and marked ready for review
- The user explicitly confirms they want to close all PRs and seal the session

## Other Capabilities

### Retrieving CI Job Logs

Use `cloud_ci_get_logs` to retrieve the full plain-text log for a specific CI job. This is the drill-in tool for investigating CI failures after identifying a failed job from the session's CI status.

**ONLY use this tool when NO CIPE (CI Pipeline Execution) exists for the PR.** When a CIPE exists (`ciStatus[prId].cipeUrl` is non-null), logs and failure data are available through the CIPE system (Nx Cloud) via `ci_information` — do NOT call `cloud_ci_get_logs`. This tool is specifically for PRs where only external CI runs exist (e.g., GitHub Actions runs without an Nx Cloud CIPE).

**Parameters:**

- `sessionId` (required): The Polygraph session ID
- `workspaceId` (required): Nx Cloud workspace ID (MongoDB ObjectId hex string, from `session.workspaces[].id`)
- `jobId` (required): GitHub Actions job ID (from `ciStatus[prId].externalCIRuns[].jobs[].jobId` in the `get_session` response)

**Returns:**

- On success: `{ success: true, jobId: number, logFile: string, sizeBytes: number }`
- On failure: `{ success: false, error: string }`

The tool saves the log to a local temp file and returns the path in `logFile`. Use the `Read` tool to examine the file contents. For large logs, use `offset` and `limit` parameters to read specific sections.

```
cloud_ci_get_logs(
  sessionId: "<session-id>",
  workspaceId: "<workspace-id>",
  jobId: 12345678
)
// Returns: { success: true, jobId: 12345678, logFile: "/tmp/ci-logs/job-12345678.log", sizeBytes: 152340 }
// Then: Read(logFile) to examine the log
```

**Typical flow:**

1. Use `cloud_polygraph_get_session` to see PR CI status
2. Check `ciStatus[prId].cipeUrl` — if a CIPE exists, use `ci_information` for logs and skip this tool
3. If NO CIPE exists, check `ciStatus[prId].externalCIRuns` — examine runs and jobs directly from the session data
4. For a failed job, call `cloud_ci_get_logs(sessionId, workspaceId, jobId)` to save the log to a file
5. Use `Read(logFile)` to examine the log content — use `offset`/`limit` for large files

**Important:** Logs can be large (100KB+). Only fetch logs for failed or relevant jobs, and read only the sections you need.

### Session State for Resume (Required)

The `plan` and `agentSessionId` parameters are **required** on `cloud_polygraph_create_prs`, `cloud_polygraph_mark_ready`, and `cloud_polygraph_associate_pr`. You must always provide both values together. They save session state that enables resuming the Polygraph session later.

- **`plan`**: A high-level description of what this session is doing (e.g., "Add user preferences feature across frontend and backend repos"). This helps anyone resuming the session understand the context.
- **`agentSessionId`**: The Claude CLI session ID for the parent agent. This is the session ID that can be passed to `claude --continue` to resume exactly where the agent left off.

These fields are saved to the Polygraph session server-side and are available from `cloud_polygraph_get_session`. The Polygraph UI also shows a "Resume Session" section with copy-able commands when these fields are present.

### Resuming a Polygraph Session

If a session has a saved `agentSessionId`, it can be resumed using:

```
claude --continue <agentSessionId>
```

This resumes the Claude CLI session that was coordinating the Polygraph work, restoring the full conversation context including which repos were involved, what work was delegated, and what remains to be done.

To check if a session is resumable, call `cloud_polygraph_get_session` and look for the `agentSessionId` field in the response.

### Print Polygraph Session Details

When asked to print polygraph session details, use `cloud_polygraph_get_session` and display in the following format:

**Session:** POLYGRAPH_SESSION_URL

| Repo           | PR                 | PR Status | CI Status | Self-Healing        | CI Link          |
| -------------- | ------------------ | --------- | --------- | ------------------- | ---------------- |
| REPO_FULL_NAME | [PR_TITLE](PR_URL) | PR_STATUS | CI_STATUS | SELF_HEALING_STATUS | [View](CIPE_URL) |

If the session has a `plan` or `agentSessionId`, also display:

**Plan:** SESSION_PLAN

**Resume:** `claude --continue AGENT_SESSION_ID`

(Omit the Plan line if `plan` is null. Omit the Resume line if `agentSessionId` is null.)

**Local paths:**

- REPO_FULL_NAME: LOCAL_PATH

- REPO_FULL_NAME: from `workspaces[].vcsConfiguration.repositoryFullName` (match workspace to PR via `workspaceId`)
- LOCAL_PATH: the absolute path to the local clone of the repo. For the initiator workspace, this is the current working directory. For delegated workspaces, the path is available from `cloud_polygraph_child_status`.
- PR_URL, PR_TITLE, PR_STATUS: from `pullRequests[]`
- CI_STATUS: from `ciStatus[prId].status`
- SELF_HEALING_STATUS: from `ciStatus[prId].selfHealingStatus` (omit or show `-` if null)
- CIPE_URL: from `ciStatus[prId].cipeUrl`
- POLYGRAPH_SESSION_URL: from `polygraphSessionUrl`
- SESSION_PLAN: from `plan`
- AGENT_SESSION_ID: from `agentSessionId`

## Best Practices

{%- if platform == "claude" %}

1. **Delegate via background subagents** — Use `Task(run_in_background: true)` for each repo delegation. This keeps polling noise out of the main conversation.
   {%- elsif platform == "opencode" %}
1. **Delegate via subagents** — Use `@polygraph-delegate-subagent` for each repo delegation. The subagent handles the delegate-and-poll cycle.
   {%- else %}
1. **Delegate asynchronously** — Use `cloud_polygraph_delegate` which returns immediately, then poll with `cloud_polygraph_child_status`.
   {%- endif %}
1. **Poll child status before proceeding** — Always verify child agents have completed via `cloud_polygraph_child_status` before pushing branches or creating PRs
1. **Link PRs in descriptions** - Reference related PRs in each PR body
1. **Keep PRs as drafts** until all repos are ready
1. **Test integration** before marking PRs ready
1. **Coordinate merge order** if there are deployment dependencies
   {%- if platform == "claude" %}
1. **Always delegate via background Task subagents**. Never call `cloud_polygraph_delegate` directly in the main conversation.
   {%- elsif platform == "opencode" %}
1. **Always delegate via `@polygraph-delegate-subagent`**. Never call `cloud_polygraph_delegate` directly in the main conversation.
   {%- endif %}
1. **Use `cloud_polygraph_stop_child` to clean up** — Stop child agents that are stuck or no longer needed
   {%- if platform == "claude" %}
1. **Always provide `plan` and `agentSessionId`** — These are required on `cloud_polygraph_create_prs`, `cloud_polygraph_mark_ready`, and `cloud_polygraph_associate_pr`. Always pass both values so the session can be resumed later with `claude --continue`
   {%- elsif platform == "opencode" %}
1. **Always provide `plan` and `agentSessionId`** — These are required on `cloud_polygraph_create_prs`, `cloud_polygraph_mark_ready`, and `cloud_polygraph_associate_pr`. Always pass both values so the session can be resumed later with `opencode --continue`
   {%- else %}
1. **Always provide `plan` and `agentSessionId`** — These are required on `cloud_polygraph_create_prs`, `cloud_polygraph_mark_ready`, and `cloud_polygraph_associate_pr`. Always pass both values so the session can be resumed later.
   {%- endif %}
1. **Only complete sessions when asked** — Only call `cloud_polygraph_modify_session` with `complete: true` when the user explicitly requests it. Completing a session closes all open/draft PRs and seals the session. Do not automatically complete sessions.
