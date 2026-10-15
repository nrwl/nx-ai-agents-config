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
- One plugin is built from this repo: **nx**, with source in `artifacts/` and output to the repo root (`skills/`, `agents/`, `.mcp.json`) and `generated/`
- Generated files:
  - Claude Code and Cursor plugins share output: `skills/`, `agents/`, `.mcp.json`
    - Claude plugin manifest: `.claude-plugin/plugin.json`
    - Cursor plugin manifest: `.cursor-plugin/plugin.json` (uses convention-based discovery of root `skills/` and `agents/`)
  - Other agents output to `generated/`. Nx versions before 24 copy these into workspaces; newer versions install the npm packages instead and no longer configure Copilot or Gemini:
    - `.opencode/` - OpenCode
    - `.github/` - GitHub Copilot
    - `.cursor/` - Cursor
    - `.gemini/` - Gemini
    - `.agents/` - Codex (skills only)
    - `.codex/` - Codex (MCP config)
- The plugin is registered in `.claude-plugin/marketplace.json`

# npm packages

`node scripts/package-plugins.mjs` (nx target `package-plugins`) assembles the published packages into `dist/` (gitignored) from the generated outputs above plus the runtime code in `plugins/`:

- `@nx/claude-plugin` (`dist/claude`): root `skills/`, `agents/`, `.mcp.json`, plus the SessionStart hook in `plugins/claude` and `plugins/shared/hooks`
- `@nx/codex-plugin` (`dist/codex`): `generated/.agents/skills`, a `.codex-plugin/plugin.json`, the same SessionStart hook, and the `nx-codex-plugin` installer (`plugins/codex`). The installer caches the plugin in Codex without enabling it globally; workspaces enable it in `.codex/config.toml`.
- `@nx/opencode-plugin` (`dist/opencode`): `generated/.opencode` content loaded by the plugin module in `plugins/opencode`

The Nx guidelines that used to be written into AGENTS.md/CLAUDE.md live in `plugins/shared/hooks/nx-guidelines.md` and reach the agent through the SessionStart hook (Claude Code, Codex) or OpenCode `instructions`.

Cursor has no npm package: Cursor project plugins are installed from this repository at a release tag (`.cursor/settings.json` → `gitUrl` + `gitRef`), using the root `.cursor-plugin/plugin.json`.

# Plugin Versioning

Version is tracked in `.claude-plugin/plugin.json` (source of truth) and mirrored to `.cursor-plugin/plugin.json`.

## How it works

- Merging to `main` does not change the version. Releases are cut manually.
- To release, run the **Release PR** workflow (`.github/workflows/release-pr.yml`) from the Actions tab and pick `patch`, `minor` or `major`. It opens a `chore: release X.Y.Z` PR with the bumped manifests.
- Merging that PR triggers **Stage Release** (`.github/workflows/publish.yml`): it builds the npm packages, publishes them with provenance, and pushes the `vX.Y.Z` tag Cursor installs from. Each npm package needs a trusted publisher configured for that workflow.

## Manual version bump

```bash
node scripts/bump-version.mjs --version X.Y.Z
npx nx sync-artifacts
```

## Testing a PR plugin version

The marketplace installs the published `@nx/claude-plugin`, so a PR's changes are not picked up from its branch. Check out the branch, build the packages, and load the plugin for one session:

```bash
npx nx package-plugins
claude --plugin-dir dist/claude
```

For Codex, run `node dist/codex/bin/nx-codex-plugin.mjs install` from the same build.
