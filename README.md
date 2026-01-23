# Nx AI Agents Configuration

This repository contains the official AI agent configuration artifacts for [Nx](https://nx.dev). It provides skills, subagents, and commands that enhance AI coding assistants with Nx-specific capabilities.

## Supported AI Agents

Configuration is generated for the following tools:

- **Claude Code** - Anthropic's CLI for Claude
- **OpenCode** - Open source AI coding assistant
- **GitHub Copilot** - GitHub's AI pair programmer
- **Cursor** - AI-powered code editor
- **Gemini** - Google's AI assistant

## Getting Started

The easiest way to add these AI agent configurations to your Nx workspace is by running:

```sh
nx configure-ai-agents
```

This will set up the appropriate configuration files for your preferred AI tools.

## Related Projects

- **[nx-mcp](https://www.npmjs.com/package/nx-mcp)** - The Nx MCP (Model Context Protocol) server that powers AI agent integrations
- **[Nx Console](https://github.com/nrwl/nx-console)** - The repository where nx-mcp and these configurations are maintained

## Development / Contributing

Want to contribute or modify the AI agent configurations? Here's how to work in this repository:

### Making Changes

1. All source artifacts live in the `/artifacts` directory:

   - `artifacts/commands/` - Slash commands
   - `artifacts/skills/` - Skills
   - `artifacts/agents/` - Subagents

2. After making changes, run the sync script to distribute to agent-specific formats:

   ```sh
   npx nx sync-artifacts
   ```

3. This generates output in the `generated/` directory:
   - `generated/nx-claude-plugin/` - Claude Code plugin
   - `generated/.opencode/` - OpenCode
   - `generated/.github/` - GitHub Copilot
   - `generated/.cursor/` - Cursor
   - `generated/.gemini/` - Gemini
