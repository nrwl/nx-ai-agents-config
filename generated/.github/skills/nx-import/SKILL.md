---
name: nx-import
description: Import, merge, or combine repositories into an Nx workspace using nx import. USE WHEN the user asks to adopt Nx across repos, move projects into a monorepo, or bring code/history from another repository.
---

## Quick Start

1. Run `nx import --help` for an overview of available options.
2. Run `nx import` with `--source` and `--destination`.
3. Treat both local paths and Git repositories as valid import sources.

`nx import` brings code from a source repository or folder into a destination folder in the current workspace and can preserve commit history for imported files so merged projects keep traceable history.

Primary docs:

- https://nx.dev/nx/import
- https://nx.dev/docs/guides/adopting-nx/import-project

## Plugins

- If no plugin choice is specified, Nx CLI prompts with plugins it detects as relevant for the workspace.
- For best integration, we recommend installing plugins, especially for net-new technologies.
- If those technologies already exist in the destination repo, adding Nx plugins can introduce configuration conflicts with existing projects.
- Explore the destination workspace first, and ask the user for guidance when plugin selection is unclear.
- The agent can choose all plugins, skip plugins, or choose a specific list of plugins to control this directly
- Plugin docs: https://nx.dev/docs/concepts/nx-plugins

## Follow-up and Cleanup

- Run workspace validation tasks with `nx run-many` to confirm import changes did not break existing projects.
  - Example: `nx run-many -t build lint test typecheck`
- If validation fails, investigate and fix root causes before continuing (imports often surface dependency/version mismatches rather than import-command issues).
- Decide dependency strategy based on current workspace patterns, or confirm with the user:
  - https://nx.dev/docs/concepts/decisions/dependency-management
- If the workspace wants a single-version policy, consolidate dependency versions across affected `package.json` files.
- Review versions of common/shared dependencies across imported and existing projects, then ask whether to align them; respect existing `pnpm` catalog usage when defining aligned versions.

## Technology-specific Next Steps

### Turborepo

- For automated migration flow and follow-up details:
  - https://nx.dev/docs/guides/adopting-nx/from-turborepo#easy-automated-migration-example
