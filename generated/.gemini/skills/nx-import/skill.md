---
name: nx-import
description: Import, merge, or combine repositories into an Nx workspace using nx import. USE WHEN the user asks to adopt Nx across repos, move projects into a monorepo, or bring code/history from another repository.
---

# Nx Import

USE WHEN the user wants to import, merge, or combine repositories/projects into an Nx workspace.

## Quick Start

1. Run `nx import --help` for an overview of available options.
2. Make sure the destination directory in the target workspace is empty before importing.
3. Run `nx import` with `--source` and `--destination`.
4. Treat both local paths and Git repositories as valid import sources.
5. If importing multiple libraries into `libs/`, import each one individually into its own destination path.
   Example: import `packages/lib1` into `libs/lib1`, then `packages/lib2` into `libs/lib2`.

`nx import` brings code from a source repository or folder into a destination folder in the current workspace and can preserve commit history for imported files so merged projects keep traceable history.

Primary docs:

- https://nx.dev/nx/import
- https://nx.dev/docs/guides/adopting-nx/import-project
- https://nx.dev/docs/guides/adopting-nx/preserving-git-histories

## Plugins

- If no plugin choice is specified, Nx CLI prompts with plugins it detects as relevant for the workspace.
- For best integration, recommend installing plugins, especially for net-new technologies.
- If those technologies already exist in the destination repo, adding Nx plugins can introduce configuration conflicts with existing projects.
- Explore the workspace first, and ask the user for guidance when plugin selection is unclear.
- You can choose all plugins, skip plugins, or provide a specific plugin list directly.
- Plugin docs: https://nx.dev/docs/concepts/nx-plugins

## Follow-up and Cleanup

- Run workspace validation tasks with `nx run-many` to confirm import changes did not break existing projects.
  - Example: `nx run-many -t build lint test typecheck`
- If validation fails, investigate and fix root causes before continuing (imports often surface dependency/version mismatches rather than import-command issues).
- Decide dependency strategy based on current workspace patterns, or confirm with the user:
  - https://nx.dev/docs/concepts/decisions/dependency-management
- If the workspace wants a single-version policy, consolidate dependency versions across affected `package.json` files.
- Review versions of common/shared dependencies across imported and existing projects, then ask whether to align them; respect existing `pnpm` catalog usage when defining aligned versions.

## Technology-specific Guidance

- There are targeted instructions for different technologies
- Identify technologies used in the source repo(s), then read and apply the matching file(s) in `references/`.
- If multiple technologies are present, apply all relevant reference files and resolve conflicts with the user.

Available references:

- `references/GRADLE.md`
- `references/TURBOREPO.md`
