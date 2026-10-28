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
  <a href="#contributing">Contributing</a>
</p>

## Getting Started

The easiest way to add these AI agent configurations to your Nx workspace is by running:

```sh
nx configure-ai-agents
```

This will set up the appropriate configuration files for your preferred AI tools.

### Preview: the nx and nx-cloud plugins

`plugins/` holds two plugins that work across coding agents without any per-agent build: **nx** (workspace skills and the nx MCP server) and **nx-cloud** (CI monitoring, CI failure review, cache investigation, the Nx Cloud API, and the hosted Nx Cloud MCP server). They are not yet what `nx configure-ai-agents` installs.

**Claude Code**: add the marketplace and enable the plugins in `.claude/settings.json`. Disable the current `nx@nx-claude-plugins` plugin in the same file, since both are named `nx`:

```json
{
  "extraKnownMarketplaces": {
    "nx-plugins": {
      "source": {
        "source": "github",
        "repo": "nrwl/nx-ai-agents-config",
        "path": "plugins/.claude-plugin/marketplace.json"
      }
    }
  },
  "enabledPlugins": {
    "nx@nx-plugins": true,
    "nx-cloud@nx-plugins": true,
    "nx@nx-claude-plugins": false
  }
}
```

**Codex**: add the marketplace once, then install or enable the plugins:

```sh
codex plugin marketplace add nrwl/nx-ai-agents-config
codex plugin add nx@nx-plugins
codex plugin add nx-cloud@nx-plugins
```

A repository can enable them for everyone who has added the marketplace in `.codex/config.toml`. Codex starts plugin MCP servers outside the workspace, so the repository also declares the nx MCP server there, which takes precedence over the plugin's copy (`nx configure-ai-agents` already writes this entry):

```toml
[plugins."nx@nx-plugins"]
enabled = true

[plugins."nx-cloud@nx-plugins"]
enabled = true

[mcp_servers.nx-mcp]
command = "npx"
args = ["nx-mcp@latest", "--minimal"]
```

**Cursor**: load the plugins from a checkout of this repository with `cursor-agent --plugin-dir <checkout>/plugins/nx --plugin-dir <checkout>/plugins/nx-cloud`.

## Features

https://github.com/user-attachments/assets/edd45819-e955-4ba7-adba-8255f4174da6

Nx AI agent skills teach your coding assistant how to work effectively in your monorepo. Key capabilities:

- **CI Monitoring & Self-Healing**: Watches CI pipelines, detects failures, and applies fixes automatically
- **Workspace Understanding**: Agents explore your project graph, dependencies, and conventions before acting
- **Intelligent Code Generation**: Scaffolds new code following your workspace's existing patterns, tags, and tooling
- **Monorepo-Aware Skills**: A series of skills that help your agent navigate, build, and operate more efficiently in monorepo setups
- **Multi-Agent Support**: Works across Claude Code, GitHub Copilot, Cursor, Gemini, and OpenCode

Read more on the [Nx blog](https://nx.dev/blog/nx-ai-agent-skills).

## Learn More

- **[nx-mcp](https://www.npmjs.com/package/nx-mcp)** - The Nx MCP server that powers AI agent integrations
- **[Nx Console](https://github.com/nrwl/nx-console)** - The repository where nx-mcp and these configurations are maintained
- **[Teach Your AI Agent How to Work in a Monorepo](https://nx.dev/blog/nx-ai-agent-skills)** - Intro blog post for this project
- **[Why We Deleted (Most of) Our MCP Tools](https://nx.dev/blog/why-we-deleted-most-of-our-mcp-tools)** - Why skills over MCP tools
- **[Introducing Self-Healing CI](https://nx.dev/blog/nx-self-healing-ci)** - AI agents that automatically fix CI failures
- **[Autonomous Agents at Scale](https://nx.dev/blog/ai-agents-and-continuity)** - How monorepo architecture enables autonomous AI agents

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md).
