---
description: 'Monitor Nx Cloud CI pipeline and handle self-healing fixes automatically'
argument-hint: '[instructions] [--max-cycles N] [--timeout MINUTES] [--verbosity minimal|medium|verbose] [--branch BRANCH] [--fresh]'
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Task
  - mcp__nx-mcp__ci_information
  - mcp__nx-mcp__update_self_healing_fix
---

# Nx CI Monitor Command

Invoke the `nx:ci-monitor` skill to monitor Nx Cloud CI pipeline.

**Arguments:** $ARGUMENTS

Use the Skill tool to invoke the ci-monitor skill, passing along the user's arguments:

```
Skill({ skill: "nx:ci-monitor", args: "$ARGUMENTS" })
```
