---
name: nx-workspace
description: "Explore and understand Nx workspaces. USE WHEN answering questions about the workspace, projects, or tasks. ALSO USE WHEN an nx command fails or you need to check available targets/configuration before running a task. EXAMPLES: 'What projects are in this workspace?', 'How is project X configured?', 'What depends on library Y?', 'What targets can I run?', 'Cannot find configuration for task', 'debug nx task failure'."
---

---

name: nx-workspace
description: >
Explore and understand Nx workspaces — project listing, configuration, targets,
dependencies, and the project graph. Use when answering questions about workspace
structure, debugging nx command failures, checking available targets, exploring
project dependencies, viewing affected projects, or understanding the project graph.
Covers questions like "What projects exist?", "How is X configured?", "What depends
on Y?", "What targets can I run?", and errors like "Cannot find configuration for task".
allowed-tools:

- Bash
- Glob
- Grep
- Read

---

# Nx Workspace Exploration

Read-only exploration of Nx workspaces: structure, project configuration, available targets, dependencies, and the project graph.

When processing CLI results, prefer `--json` output and process it with `jq` rather than counting or parsing text manually.

Keep in mind that you might have to prefix commands with `npx`/`pnpx`/`yarn` if nx is not installed globally. Check the lockfile to determine the package manager in use.

## Listing Projects

Use `nx show projects` to list projects in the workspace.

The project filtering syntax (`-p`/`--projects`) works across many Nx commands including `nx run-many`, `nx release`, `nx show projects`, and more. Filters support explicit names, glob patterns, tag references (e.g. `tag:name`), directories, and negation (e.g. `!project-name`).

```bash
# List all projects
nx show projects

# JSON output (for programmatic use)
nx show projects --json
nx show projects --json | jq 'length'  # count projects

# Filter by pattern (glob)
nx show projects --projects "apps/*"
nx show projects --projects "shared-*"

# Filter by tag
nx show projects --projects "tag:publishable"
nx show projects -p 'tag:publishable,!tag:internal'

# Filter by target (projects that have a specific target)
nx show projects --withTarget build

# Combine filters
nx show projects --type lib --withTarget test
nx show projects --affected --exclude="*-e2e"
nx show projects -p "tag:scope:client,packages/*"

# Negate patterns
nx show projects -p '!tag:private'
nx show projects -p '!*-e2e'
```

## Project Configuration

Use `nx show project <name> --json` to get the full resolved configuration for a project.

**Important**: Do NOT read `project.json` directly — it only contains partial configuration. The `nx show project --json` command returns the full resolved config including inferred targets from plugins.

You can read the full project schema at `node_modules/nx/schemas/project-schema.json` to understand nx project configuration options.

```bash
# Full project configuration
nx show project my-app --json

# Extract specific parts
nx show project my-app --json | jq '.targets'
nx show project my-app --json | jq '.targets | keys'
nx show project my-app --json | jq '.targets.build'

# Project metadata
nx show project my-app --json | jq '{name, root, sourceRoot, projectType, tags}'
nx show project my-app --json | jq -r '.root'
nx show project my-app --json | jq '.tags'
```

## Target Information

Targets define what tasks can be run on a project.

```bash
# List all targets for a project
nx show project my-app --json | jq '.targets | keys'

# Target configuration details
nx show project my-app --json | jq '.targets.build'
nx show project my-app --json | jq '.targets.build.executor'
nx show project my-app --json | jq '.targets.build.command'
nx show project my-app --json | jq '.targets.build.options'

# Caching inputs/outputs
nx show project my-app --json | jq '.targets.build.inputs'
nx show project my-app --json | jq '.targets.build.outputs'

# Find projects with a specific target
nx show projects --withTarget serve
nx show projects --withTarget e2e
```

## Workspace Configuration

Read `nx.json` directly for workspace-level configuration.
You can read the full schema at `node_modules/nx/schemas/nx-schema.json` to understand workspace configuration options.

```bash
cat nx.json

# Or use jq for specific sections
cat nx.json | jq '.targetDefaults'
cat nx.json | jq '.namedInputs'
cat nx.json | jq '.plugins'
cat nx.json | jq '.generators'
```

Key nx.json sections:

- `targetDefaults` — Default configuration applied to all targets of a given name
- `namedInputs` — Reusable input definitions for caching
- `plugins` — Nx plugins and their configuration
- ...and more; read the schema or nx.json for details

## Project Graph and Dependencies

Use `nx graph --print` to get the full dependency graph as JSON.

```bash
nx graph --print

# Get all project names from graph
nx graph --print | jq '.graph.nodes | keys'

# Find dependencies of a project
nx graph --print | jq '.graph.dependencies["my-app"]'

# Find projects that depend on a library (reverse lookup)
nx graph --print | jq '.graph.dependencies | to_entries[] | select(.value[].target == "shared-ui") | .key'
```

## Affected Projects

If the user is asking about affected projects, read the [affected projects reference](references/AFFECTED.md) for detailed commands and examples.

## Common Exploration Patterns

### "What's in this workspace?"

```bash
nx show projects
nx show projects --type app
nx show projects --type lib
```

### "How do I build/test/lint project X?"

```bash
nx show project X --json | jq '.targets | keys'
nx show project X --json | jq '.targets.build'
```

### "What depends on library Y?"

```bash
nx graph --print | jq '.graph.dependencies | to_entries[] | select(.value[].target == "Y") | .key'
```

## Troubleshooting

### "Cannot find configuration for task X:target"

```bash
# Check what targets exist on the project
nx show project X --json | jq '.targets | keys'

# Check if any projects have that target
nx show projects --withTarget target
```

### "The workspace is out of sync"

```bash
nx sync
nx reset  # if sync doesn't fix stale cache
```
