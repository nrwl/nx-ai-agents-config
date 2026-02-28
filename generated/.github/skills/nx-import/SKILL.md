---
name: nx-import
description: Import, merge, or combine repositories into an Nx workspace using nx import. USE WHEN the user asks to adopt Nx across repos, move projects into a monorepo, or bring code/history from another repository.
---

## Quick Start

- `nx import` brings code from a source repository or folder into a destination folder in the current workspace and can preserve commit history for imported files so merged projects keep traceable history.
- after nx `22.6.0`, `nx import` is optimized for ai agent use and will respond with .ndjson outputs and follow up questions. For earlier versions, stdin prompts are configured so always run with --no-interactive and specify all flags directly
- Run `nx import --help` for an overview of available options.
- Run `nx import` with `--source` and `--destination`.
- Make sure the destination directory in the target workspace is empty before importing.
  EXAMPLE SCENARIO 1:
  target has `libs/` with `libs/utils` and `libs/models` dirs
  source has `libs/` with `libs/ui` and `libs/data-access` dirs
  => You cannot import `libs/` into `libs/` directly. Instead import each source library into `libs/` individually

  EXAMPLE SCENARIO 2:
  target has `packages/` with some subdirs
  source has `apps/app1`, `apps/app2` as `packages/` with some subdirs
  => you can import all the apps in `apps/` directly because there is no `/apps` folder in the target repo. But you have to import the individual dirs in `packages/` individually

Primary docs:

- https://nx.dev/docs/guides/adopting-nx/import-project
- https://nx.dev/docs/guides/adopting-nx/preserving-git-histories

Make sure to read the nx docs if you have the tools for it, they give a lot of relevant context on how to merge/combine/import repos.

## Plugins

- If no plugin choice is specified, Nx CLI asks with plugins it detects as relevant for the workspace.
- For best integration, recommend installing plugins, especially for net-new technologies.
- If those technologies already exist in the destination repo, adding Nx plugins can introduce configuration conflicts with existing projects.
- Explore the workspace first, and ask the user for guidance when plugin selection is unclear.
- You can choose all plugins, skip plugins, or provide a specific plugin list directly.
- if you decide against adding plugins during the import, you can add them later using `nx add`
- often, an imported repo will have technologies already present in the destination repo. In this case make sure to integrate into the destination repo
  - EXAMPLE: target repo has @nx/eslint with inferred lint tasks. imported repo/projects have `lint` npm scripts and custom eslint config. You should integrate the imported projects to use the `@nx/eslint` inferred tasks too if possible.
  - EXAMPLE: target repo has @nx/jest with inferred tasks. imported repo/projecs have `test` npm scripts that use vitest under the hood. It's recommended to add `@nx/vitest` with inferred tasks to the monorepo but if there are good reasons to skip this,
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

- There are targeted instructions for different technologies. These have very important information for these specific technologies
- Identify technologies used in the source repo(s), then read and apply the matching file(s) in `references/`.
- If multiple technologies are present, apply all relevant reference files and resolve conflicts with the user.

Available references:

- `references/GRADLE.md`
- `references/TURBOREPO.md`
