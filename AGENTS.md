<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- You have access to the Nx MCP server and its tools, use them to help the user
- When answering questions about the repository, use the `nx_workspace` tool first to gain an understanding of the workspace architecture where applicable.
- When working in individual projects, use the `nx_project_details` mcp tool to analyze and understand the specific project structure and dependencies
- For questions around nx configuration, best practices or if you're unsure, use the `nx_docs` tool to get relevant, up-to-date docs. Always use this instead of assuming things about nx configuration
- If the user needs help with an Nx configuration or project graph error, use the `nx_workspace` tool to get any errors

<!-- nx configuration end-->

# This repository

It publishes Nx's plugins for coding agents. There are two kinds of content, and only the first is where new work goes.

## `plugins/`: the source of truth

`plugins/nx` and `plugins/nx-cloud` are installed by Claude Code, Codex and Cursor exactly as they are in git. There is no build step; edit the files directly.

- `skills/<name>/SKILL.md`: the skills. Frontmatter has only `name` and `description`.
- `plugin.json` + `mcp.json`: the [Agent Plugins](https://agent-plugins.org) manifest and MCP config, read by Codex and Cursor
- `.claude-plugin/plugin.json` + `.mcp.json`: the same for Claude Code, which uses its own formats (`type: "http"` instead of `"streamable-http"`)
- Manifests carry no `version`, so installs follow the latest commit of the ref they come from

Marketplaces, both named `nx-plugins`:

- `.agents/plugins/marketplace.json` (Codex), with relative sources
- `plugins/.claude-plugin/marketplace.json` (Claude Code). Claude Code only reads the root `.claude-plugin/marketplace.json` of a git repository, which serves the legacy plugin below, so this one is added by its raw URL and its entries point at `plugins/<name>` on `main` with `git-subdir` sources.

`tests/plugins.test.mjs` keeps the manifests, MCP configs and marketplaces in agreement.

Skills must work in every agent: no per-agent templating, no `$ARGUMENTS` or `` !`cmd` `` placeholders, no custom subagents, and no agent-specific tool names. Describe what to do, not how the agent should split up the work. Refer to tools by name and server ("the `ci_information` tool of the nx MCP server"), never in one agent's format (`mcp__nx-mcp__ci_information`).

The nx-cloud skills reach Nx Cloud through `npx nx-cloud` and the hosted Nx Cloud MCP server. monitor-ci relies on the experimental Nx Cloud CLI (`NX_CLOUD_EXPERIMENTAL_CLI=true`) for `get pipeline`, `get logs` and `fix`.

Codex starts plugin MCP servers in the plugin's cache directory, without MCP roots or any hint of the workspace, so the nx MCP server only finds the workspace when the workspace's `.codex/config.toml` declares `[mcp_servers.nx-mcp]`, which overrides the plugin's server of the same name. Keep the server name `nx-mcp`.

## Legacy files for Nx 23 and older

Released Nx versions read these from the default branch, so they must keep their paths:

- `generated/`: `nx configure-ai-agents` copies `generated/.agents`, `.opencode`, `.github`, `.cursor`, `.codex` and `.gemini` into workspaces
- The root plugin (`.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`, `skills/`, `agents/`, `.mcp.json`), installed as `nx@nx-claude-plugins` through the root `.claude-plugin/marketplace.json`

They are no longer generated. Leave them alone unless a released Nx version needs a fix, and then edit them in place: the same skill exists in each agent folder of `generated/` and in the root `skills/`, so change every copy. `tests/plugins.test.mjs` fails if a path older Nx reads disappears.

The root plugin's version is in `.claude-plugin/plugin.json` and mirrored to `.cursor-plugin/plugin.json`. To release it, run the **Release PR** workflow (`.github/workflows/release-pr.yml`) and pick `patch`, `minor` or `major`; merging the `chore: release X.Y.Z` PR is the release. `node scripts/bump-version.mjs --version X.Y.Z` bumps both manifests by hand.
