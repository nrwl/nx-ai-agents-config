---
name: nx-cloud-ultracache
description: Answer questions about Nx Cloud Ultracache and cache misses across a workspace with Nx Cloud data - which tasks cost the most CI time through misses, what a task learned to depend on, why a task missed, when a task got worse, and which change would save the most. Use the nx-cloud-api skill for every Nx Cloud read and nx-cloud-cache-investigator before recommending a configuration change.
---

# Nx Cloud Ultracache

Ultracache replaces a task's declared Nx inputs with the files it was seen reading in CI, so the
task's cache hash changes only when something it read changes. When a task still misses often,
the cause is in what it reads or hashes: inputs broader than it needs, a file or value that
changes on every run, or a commit that changed what it learned.

Use `nx-cloud-api` for every read. The Ultracache operations are pre-release, so address them by
their full path. `npx nx-cloud api --describe <path>` documents each one:

| Data | Operation |
|---|---|
| Daily hits, misses and miss durations per target | `task-stats` |
| The inputs each task of a pipeline learned | `/nx-cloud/data/v0/cipes/{cipeId}/ultracache` |
| Earlier executions of a task, with their hashes | `/nx-cloud/data/v0/runs/{runId}/tasks/{taskId}/earlier-executions` |
| What went into one execution's hash | `/nx-cloud/data/v0/runs/{runId}/tasks/{taskId}/hash-details` |

Read the reference for the question before you start:

- Which tasks cost the most through misses: [references/miss-cost.md](references/miss-cost.md)
- What a task depends on, and whether that looks right: [references/learned-inputs.md](references/learned-inputs.md)
- Why one execution missed: [references/explain-a-miss.md](references/explain-a-miss.md)
- When a task got worse, and why: [references/regressions.md](references/regressions.md)
- Which single change would save the most: [references/biggest-saving.md](references/biggest-saving.md)

For any other question, combine these. Download only what the question needs, and count from
the data you fetched; state the window and runs each number covers.

A read that must not count is excluded with `ultracache.ignoreReads` (workspace-relative globs) on
the target. That does not help with a `runtime` or `implicitDeps` change: fix the environment value
or the file that keeps changing instead. Do not change files. Before you recommend excluding or
narrowing an input, apply the change gate in `nx-cloud-cache-investigator`: removing an input that
affects the result causes wrong cache hits.
