<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/nx-logo-light.svg">
    <img src="assets/nx-logo.svg" alt="Nx Logo" width="140">
  </picture>
</p>

<h1 align="center">Nx AI Agent Skills</h1>

<p align="center">
  Official AI agent configuration artifacts for <a href="https://nx.dev">Nx</a>. Skills, subagents, and commands that enhance AI coding assistants with Nx-specific capabilities.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Claude_Code-555?logo=anthropic&logoColor=white&style=flat" alt="Claude Code">
  <img src="https://img.shields.io/badge/Cursor-555?logo=cursor&logoColor=white&style=flat" alt="Cursor">
  <img src="https://img.shields.io/badge/GitHub_Copilot-555?logo=github&logoColor=white&style=flat" alt="GitHub Copilot">
  <img src="https://img.shields.io/badge/Gemini-555?logo=google&logoColor=white&style=flat" alt="Gemini">
  <img src="https://img.shields.io/badge/OpenCode-555?logo=terminal&logoColor=white&style=flat" alt="OpenCode">
  <br>
  <img src="https://img.shields.io/github/license/nrwl/nx-ai-agents-config" alt="License">
</p>

<p align="center">
  <a href="#getting-started">Installation</a> ·
  <a href="#features">Features</a> ·
  <a href="#compatibility">Compatibility</a> ·
  <a href="#contributing">Contributing</a>
</p>

## Getting Started

The easiest way to add these AI agent configurations to your Nx workspace is by running:

```sh
nx configure-ai-agents
```

This will set up the appropriate configuration files for your preferred AI tools.

## Features

https://github.com/user-attachments/assets/edd45819-e955-4ba7-adba-8255f4174da6

Nx AI agent skills teach your coding assistant how to work effectively in your monorepo. Key capabilities:

- **CI Monitoring & Self-Healing**: Watches CI pipelines, detects failures, and applies fixes automatically
- **Workspace Understanding**: Agents explore your project graph, dependencies, and conventions before acting
- **Intelligent Code Generation**: Scaffolds new code following your workspace's existing patterns, tags, and tooling
- **Monorepo-Aware Skills**: A series of skills that help your agent navigate, build, and operate more efficiently in monorepo setups
- **Multi-Agent Support**: Works across Claude Code, GitHub Copilot, Cursor, Gemini, and OpenCode

Read more on the [Nx blog](https://nx.dev/blog/nx-ai-agent-skills).

## Compatibility

| Platform           | Install Method           |
| ------------------ | ------------------------ |
| **Claude Code**    | `nx configure-ai-agents` |
| **Cursor**         | `nx configure-ai-agents` |
| **GitHub Copilot** | `nx configure-ai-agents` |
| **Gemini**         | `nx configure-ai-agents` |
| **OpenCode**       | `nx configure-ai-agents` |

## Related Projects

- **[nx-mcp](https://www.npmjs.com/package/nx-mcp)** - The Nx MCP (Model Context Protocol) server that powers AI agent integrations
- **[Nx Console](https://github.com/nrwl/nx-console)** - The repository where nx-mcp and these configurations are maintained

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
