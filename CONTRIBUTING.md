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
   - **Claude Code plugin** outputs to the **repo root**: `skills/`, `agents/`, `.mcp.json`, `.claude-plugin/plugin.json` (required for marketplace plugin resolution)
   - Other agents output to the `generated/` directory:
     - `generated/.opencode/` - OpenCode
     - `generated/.github/` - GitHub Copilot
     - `generated/.cursor/` - Cursor
     - `generated/.gemini/` - Gemini

> **Note:** The root-level `skills/`, `agents/`, `.mcp.json`, and `.claude-plugin/plugin.json` files are auto-generated. Do not edit them directly — modify the source files in `artifacts/` and run `npx nx sync-artifacts` instead.
