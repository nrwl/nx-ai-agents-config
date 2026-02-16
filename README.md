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

## Features

https://github.com/user-attachments/assets/edd45819-e955-4ba7-adba-8255f4174da6

Nx AI agent skills teach your coding assistant how to work effectively in your monorepo. Key capabilities:

- **CI Monitoring & Self-Healing** — Watches CI pipelines, detects failures, and applies fixes automatically
- **Workspace Understanding** — Agents explore your project graph, dependencies, and conventions before acting
- **Intelligent Code Generation** — Scaffolds new code following your workspace's existing patterns, tags, and tooling
- **Monorepo-Aware Skills** — A series of skills that help your agent navigate, build, and operate more efficiently in monorepo setups
- **Multi-Agent Support** — Works across Claude Code, GitHub Copilot, Cursor, Gemini, and OpenCode

Read more on the [Nx blog](https://nx.dev/blog/nx-ai-agent-skills).

## Related Projects

- **[nx-mcp](https://www.npmjs.com/package/nx-mcp)** - The Nx MCP (Model Context Protocol) server that powers AI agent integrations
- **[Nx Console](https://github.com/nrwl/nx-console)** - The repository where nx-mcp and these configurations are maintained

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
