# Development / Contributing

Want to contribute or modify the AI agent configurations? Here's how to work in this repository:

## Making Changes

1. All source artifacts live in the `/artifacts` directory:

   - `artifacts/commands/` - Slash commands
   - `artifacts/skills/` - Skills
   - `artifacts/agents/` - Subagents

2. After making changes, run the sync script to distribute to agent-specific formats:

   ```sh
   npx nx sync-artifacts
   ```

3. This generates output:
   - **Claude Code and Cursor plugins** share root output: `skills/`, `agents/`, `.mcp.json`
     - Claude plugin manifest: `.claude-plugin/plugin.json`
     - Cursor plugin manifest: `.cursor-plugin/plugin.json` (uses convention-based discovery of root `skills/` and `agents/`)
   - Other agents output to the `generated/` directory (also used by `configure-ai-agents` in nx):
     - `generated/.opencode/` - OpenCode
     - `generated/.github/` - GitHub Copilot
     - `generated/.cursor/` - Cursor
     - `generated/.gemini/` - Gemini

4. You can validate the Cursor plugin against the official schema:

   ```sh
   npx nx validate-cursor-plugin
   ```

> **Note:** The root-level `skills/`, `agents/`, and `.mcp.json` files are auto-generated. Do not edit them directly — modify the source files in `artifacts/` and run `npx nx sync-artifacts` instead. The plugin manifests (`.claude-plugin/plugin.json`, `.cursor-plugin/plugin.json`) are maintained manually but their versions are kept in sync by `scripts/bump-version.mjs`.
