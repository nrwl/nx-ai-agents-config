---
name: nx-run-tasks
description: "Run tasks in an Nx workspace — build, test, lint, serve, typecheck, and any custom targets. Use when executing tasks on single projects, running tasks across multiple projects, or running only on affected projects. Also covers task options like caching, parallelism, configurations, and troubleshooting task failures."
---

Run Nx tasks using the commands below.

Keep in mind that you might have to prefix things with npx/pnpx/yarn if the user doesn't have nx installed globally. Look at the package.json or lockfile to determine which package manager is in use.

For more details on any command, run it with `--help` (e.g. `nx run-many --help`, `nx affected --help`).

## Discover available tasks

Check which tasks a project supports via `nx show project <projectname> --json`. The output contains a `targets` section listing all runnable targets. You can also inspect `package.json` scripts or `project.json` targets directly, but you may miss inferred tasks from Nx plugins.

You can also use the project-details tool from the Nx MCP server to discover available targets for a project without running a command.

## Run a single task

The most common way to run a task is the shorthand form:

```
nx <target> <project>
```

For example: `nx build my-app`, `nx test my-lib`, `nx lint my-app`.

The longer form also works:

```
nx run <project>:<target>
```

Here `project` is the project name defined in `package.json` or `project.json` (if present).

## Run multiple tasks

```
nx run-many -t build test lint typecheck
```

Pass a `-p` flag to filter to specific projects, otherwise it runs on all projects. Use `--exclude` to exclude projects, and `--parallel` to control the number of parallel processes (default is 3).

Examples:

- `nx run-many -t test -p proj1 proj2` — test specific projects
- `nx run-many -t test --projects=*-app --exclude=excluded-app` — test projects matching a pattern
- `nx run-many -t test --projects=tag:api-*` — test projects by tag

## Run tasks for affected projects

Use `nx affected` to only run tasks on projects that changed and projects that depend on changed projects. This is especially useful in CI and for large workspaces.

```
nx affected -t build test lint
```

By default it compares against the base branch. Customize this:

- `nx affected -t test --base=main --head=HEAD` — compare against a specific base and head
- `nx affected -t test --files=libs/mylib/src/index.ts` — specify changed files directly

## Useful flags

These flags work with `run`, `run-many`, and `affected`:

- `--skipNxCache` — rerun tasks even when results are cached
- `--verbose` — print additional information such as stack traces
- `--nxBail` — stop execution after the first failed task
- `--configuration=<name>` — use a specific configuration (e.g. `production`)

## Troubleshooting

- **"Cannot find configuration for task"** — the target name is wrong or the project does not have that target. Run `nx show project <project> --json` to list available targets.
- **Task runs but is not cached** — check that the target has proper `inputs` and `outputs` configured. Use `nx show project <project> --json` to inspect the target configuration.
- **Wrong project name** — run `nx show projects` to list all project names in the workspace.
