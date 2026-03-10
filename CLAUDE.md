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

When writing regular skills and agents in this repo (in /artifacts), always use agent-agnostic language. There are many different ways of representing MCP tool formats, different default subagents et cetera. Since we generally support all these subagents from the same source files, always use descriptions that will make sense for different coding agents.
Don't do this: "Use the mcp\_\_nx-mcp\_\_ci_information MCP tool"
Do this instead: "Use the ci-information tool from the nx MCP server" (you don't always have to mention the mcp server if it's obvious)

# Self-healing CI

- If the artifact sync verification task fails, fix it by running the sync artifacts script (`npx nx sync-artifacts`)

# Building Artifacts

This repository generates extensibility artifacts (commands, skills, subagents) for multiple AI agents.

- Run `npx nx sync-artifacts` to generate outputs for all agents
- Two plugins are built from this repo:
  - **nx** (main plugin): Source in `artifacts/`, output to repo root (`skills/`, `agents/`, `.mcp.json`) and `generated/`
  - **polygraph** plugin: Source in `artifacts/polygraph/`, output to `generated/polygraph/`
- Generated files per plugin:
  - Claude Code and Cursor plugins share output: `skills/`, `agents/`, `.mcp.json`
    - Main Claude plugin manifest: `.claude-plugin/plugin.json`
    - Polygraph Claude plugin manifest: `generated/polygraph/.claude-plugin/plugin.json`
    - Cursor plugin manifest: `.cursor-plugin/plugin.json` (uses convention-based discovery of root `skills/` and `agents/`)
  - Other agents output to `generated/` (main) and `generated/polygraph/` (polygraph):
    - `.opencode/` - OpenCode
    - `.github/` - GitHub Copilot
    - `.cursor/` - Cursor
    - `.gemini/` - Gemini
    - `.agents/` - Codex (skills only)
    - `.codex/` - Codex (MCP config)
- Both plugins are registered in `.claude-plugin/marketplace.json`

# Plugin Versioning

Version is tracked in `.claude-plugin/plugin.json` (source of truth) and mirrored to `.cursor-plugin/plugin.json` and `artifacts/polygraph/claude-config/.claude-plugin/plugin.json`.

## How it works

- **PR branches** get pre-release versions automatically (e.g., `0.2.1-pr.42`) via `.github/workflows/version-pr.yml`
- **Main** gets release versions on merge (e.g., `0.2.1`) via `.github/workflows/version-release.yml`
- Versioning is always patch-level; for minor/major bumps, manually run the bump script

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
