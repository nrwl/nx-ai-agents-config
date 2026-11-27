---
name: ci-optimization
description: Find what makes a workspace's Nx Cloud CI slow, flaky or expensive, from recorded CI data. Use this skill when a user asks for the flakiest or most costly flaky tasks, tasks to atomize or shard, targets with a low cache hit rate or inputs that are too broad, idle or oversized workers, or how CI compute and credits are trending, including as a recurring or scheduled check. Requires the nx-cloud-api skill for API access.
---

# CI optimization

How to find CI improvements in recorded Nx Cloud data. Each reference covers
one kind of finding: where its data is, how to rank it, and what to suggest.

| Finding                              | Reference                                                |
| ------------------------------------ | -------------------------------------------------------- |
| Flaky tasks                          | [references/flaky-tasks.md](references/flaky-tasks.md)   |
| Tasks to atomize or shard            | [references/sharding.md](references/sharding.md)         |
| Cache misses and broad inputs        | [references/cache-misses.md](references/cache-misses.md) |
| Worker utilization, compute, credits | [references/compute.md](references/compute.md)           |

## Where the data is

Use the Nx Cloud CLI where it has a command, and `npx nx-cloud api` (the
`nx-cloud-api` skill: authentication, pagination, errors, counting rules) for
the rest. The CLI commands need `NX_CLOUD_EXPERIMENTAL_CLI=true`; read their
`--help` for flags and JSON shapes.

| Data                                       | Source                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| Pipelines in a window                      | `npx nx-cloud pipeline list --since 7d --branch <b> --status FAILED`      |
| One pipeline's tasks, retries, cache state | `npx nx-cloud pipeline task list <pipeline> --retried --attempts` (1)     |
| Failed task logs, earlier attempts         | `npx nx-cloud pipeline logs`, `npx nx-cloud pipeline task logs --attempt` |
| Organization usage (credits or dollars)    | `npx nx-cloud org usage --daily` (organization admins only)               |
| Daily flakiness per task                   | API `flaky-tasks`, then `flaky-tasks/{metricId}/executions`               |
| Daily runs, hit rate, p50/p95 per target   | API `task-stats`                                                          |
| Runs with retried tasks across pipelines   | API `runs` with `hasRetriedTasks=true`                                    |
| CI compute, utilization and credits        | API `cipe-stats`, each CIPE's `compute`, run-group `workers`              |

(1) It makes one request per run of the pipeline, reads at most 500 tasks per
run (`truncated: true` when a run has more), and has no `hash` or `cacheable`.
For large pipelines, or those fields, read the runs' tasks with the API:
`batch/v0/run-tasks` for up to 25 runs in one request.

Names differ between sources: the task ID is `taskId` in the CLI and `id` in
the API, and the project filter is `project` on `flaky-tasks` but
`projectName` on `task-stats`. Check each with `--describe` or `--help`.

The API has no record of a task's resolved inputs, its configuration or the
reason for a miss. For those, read the workspace in a checkout of the analyzed
branch: `nx show project <name> --json` gives resolved targets and inputs,
including inferred ones, but needs installed dependencies and computes the
project graph, which in a Gradle or Maven workspace starts the build tool.
Without it, read `nx.json` (`targetDefaults`, `namedInputs`, `plugins`),
`project.json` and `package.json`; inferred targets such as `e2e-ci--*` are not
in those files. Say which statements come from recorded data and which from the
checkout.

## Things that skew every finding

- **Aggregate rows before ranking.** `task-stats` and `flaky-tasks` have one
  row per task per UTC day. Sum the days, weighting rates by their counts.
- **Group sharded and atomized siblings.** `test-ci-group-1..12` or
  `e2e-ci--<file>` targets are one target; group them by name pattern, or one
  problem fills the whole list. `targetGroupName` is the target's group label
  in the project (such as `E2E (CI)` or a Gradle task group), not a sign that
  a target was split.
- **Rank by time, not by rate.** A 2% flake on a 20-minute task that runs 500
  times a week costs more than a 40% flake on a lint that runs twice.
- **Big windows are many pages.** A large, atomized workspace has thousands
  of `task-stats` rows a day, so a week can be tens of pages. One way: read one
  full recent day, rank projects by miss time, then read the week for the top
  projects with `projectName`. Say what the data leaves out.
- **Today is not over.** Daily rows for the current UTC day still change.
- **Compare like with like.** Measure two windows the same way. `task-stats`
  and `flaky-tasks` have no branch filter, and mix the default branch, PRs and
  scheduled jobs (a nightly matrix can dominate some targets). To separate
  them, sample pipelines with `pipeline list --branch` or `cipe-stats` with
  `branch`.
- **Leave out tasks whose duration isn't work.** Non-cacheable tasks,
  `continuous` tasks, and servers that other tasks wait for (a local registry
  or dev server with a ready signal) run as long as their consumers and
  always miss.

## Following up

`nx-cloud-cache-investigator` explains one cache miss in depth, and
`nx-cloud-ci-failure-review` one failed pipeline. A finding is a hypothesis
until a change is measured in CI; link the recorded data that supports it.
