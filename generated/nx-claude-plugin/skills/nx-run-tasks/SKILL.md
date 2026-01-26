---
name: nx-run-tasks
description: Whenever you need understanding on how to run tasks in a workspace using Nx
---

---

name: nx-run-tasks
description: Whenever you need understanding on how to run tasks in a workspace using Nx
allowed-tools: Bash, Glob, Grep, Read

---

You can run tasks with Nx in the following way.

Keep in mind that you might have to prefix things with npx/pnpx/yarn if the user doesn't have nx installed globally. Look at the package.json or lockfile to determine which package manager is in use.

## Understand which tasks can be run

You can check those via `nx show project <projectname> --json`, for example `nx show project myapp --json`. It contains a `targets` section which has information about targets that can be run. You can also just look at the `package.json` scripts or `project.json` targets, but you might miss out on inferred tasks by Nx plugins.

## Run a single task

nx run <project>:<task>

where

- `project` is the project name defined in the `package.json` or in `project.json` (if present)

## Run multiple tasks in parallel

Example:
nx run-many -t build test lint typecheck

you can pass a `-p` flag to list only some projects otherwise it'll be run on all projects
