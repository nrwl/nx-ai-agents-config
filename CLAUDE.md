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

# Self-healing CI

- If the artifact sync verification task fails, fix it by running the sync artifacts script (`npx nx sync-artifacts`)

# Building Artifacts

This repository generates extensibility artifacts (commands, skills, subagents) for multiple AI agents.

- Source files are in `artifacts/` directory
- Run `npx nx sync-artifacts` to generate outputs for all agents
- Generated files go to `generated/` directory:
  - `generated/nx-claude-plugin/` - Claude Code plugin
  - `generated/.opencode/` - OpenCode
  - `generated/.github/` - GitHub Copilot
  - `generated/.cursor/` - Cursor
  - `generated/.gemini/` - Gemini

# Plugin Versioning

Version is tracked in 3 files (kept in sync automatically):

1. `artifacts/claude-config/.claude-plugin/plugin.json` — source of truth
2. `.claude-plugin/marketplace.json` → `plugins[0].version`
3. `generated/nx-claude-plugin/.claude-plugin/plugin.json` — auto-copied by `sync-artifacts`

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
