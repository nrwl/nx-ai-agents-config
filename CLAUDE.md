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

# Plugins

`plugins/` holds the **nx** and **nx-cloud** plugins. Each plugin directory is what every agent installs as-is, with no build step:

- `skills/<name>/SKILL.md`: the skills, edited directly. Frontmatter has only `name` and `description`.
- `plugin.json` + `mcp.json`: the [Agent Plugins](https://agent-plugins.org) manifest and MCP config, read by Codex and Cursor
- `.claude-plugin/plugin.json` + `.mcp.json`: the same for Claude Code, which uses its own formats (`type: "http"` instead of `"streamable-http"`)
- Manifests carry no `version`, so installs follow the latest commit of the ref they come from

Marketplaces: `plugins/.claude-plugin/marketplace.json` (Claude Code) and `.agents/plugins/marketplace.json` (Codex), both named `nx-plugins`. `tests/plugins.test.mjs` keeps the manifests, MCP configs and marketplaces in agreement.

Codex starts plugin MCP servers in the plugin's cache directory, without MCP roots or any hint of the workspace, so the nx MCP server only finds the workspace when the workspace's `.codex/config.toml` declares `[mcp_servers.nx-mcp]`, which overrides the plugin's server of the same name. Keep the server name `nx-mcp`.

Skills must work in every agent: no per-agent templating, no `$ARGUMENTS` or `` !`cmd` `` placeholders, no custom subagents, and no agent-specific tool names. The nx-cloud skills reach Nx Cloud through `npx nx-cloud` and the hosted Nx Cloud MCP server; monitor-ci also uses the CI tools of the nx MCP server.

# Legacy output for Nx 23 and older

Everything below describes the files released Nx versions read: `artifacts/`, the root `skills/`, `agents/` and `.mcp.json`, and `generated/`. Leave them unchanged and make skill changes in `plugins/`.

When writing regular skills and agents in this repo (in /artifacts), always use agent-agnostic language. There are many different ways of representing MCP tool formats, different default subagents et cetera. Since we generally support all these subagents from the same source files, always use descriptions that will make sense for different coding agents.
Don't do this: "Use the mcp\_\_nx-mcp\_\_ci_information MCP tool"
Do this instead: "Use the ci-information tool from the nx MCP server" (you don't always have to mention the mcp server if it's obvious)

# Self-healing CI

- If the artifact sync verification task fails, fix it by running the sync artifacts script (`npx nx sync-artifacts`)

# Building Artifacts

This repository generates extensibility artifacts (commands, skills, subagents) for multiple AI agents.

- Run `npx nx sync-artifacts` to generate outputs for all agents
- One plugin is built from this repo: **nx**, with source in `artifacts/` and output to the repo root (`skills/`, `agents/`, `.mcp.json`) and `generated/`
- Generated files:
  - Claude Code and Cursor plugins share output: `skills/`, `agents/`, `.mcp.json`
    - Claude plugin manifest: `.claude-plugin/plugin.json`
    - Cursor plugin manifest: `.cursor-plugin/plugin.json` (uses convention-based discovery of root `skills/` and `agents/`)
  - Other agents output to `generated/`:
    - `.opencode/` - OpenCode
    - `.github/` - GitHub Copilot
    - `.cursor/` - Cursor
    - `.gemini/` - Gemini
    - `.agents/` - Codex (skills only)
    - `.codex/` - Codex (MCP config)
- The plugin is registered in `.claude-plugin/marketplace.json`

# Plugin Versioning

Version is tracked in `.claude-plugin/plugin.json` (source of truth) and mirrored to `.cursor-plugin/plugin.json`.

## How it works

- Merging to `main` does not change the version. Releases are cut manually.
- To release, run the **Release PR** workflow (`.github/workflows/release-pr.yml`) from the Actions tab and pick `patch`, `minor` or `major`. It opens a `chore: release X.Y.Z` PR with the bumped manifests; merging that PR is the release.

## Manual version bump

```bash
node scripts/bump-version.mjs --version X.Y.Z
npx nx sync-artifacts
```

## Testing a PR plugin version

Coworkers can test a PR's plugin version by creating `.claude/settings.local.json` (gitignored) with:

```json
{
  "plugins": {
    "nx": {
      "ref": "pr-branch-name"
    }
  }
}
```

Restart Claude Code, test, then remove the override when done.
