# Worker utilization, compute and credits

Covers Nx Cloud Workers (Nx managed or bring your own compute). Manual
distribution on the customer's own machines has no worker records.

## Workspace totals

`cipe-stats` summarizes the CIPEs (pipelines) created in a window of up to 92
days: `vmMinutes`, `credits`, `cpuUtilization` and `memoryUtilization`, each
with an average, percentiles and its own `cipeCount`. Filter by `branch` and
`statuses`, and use `runner=WORKERS` to leave out manual distribution. The
utilizations are sampled use over the capacity of each worker's resource class
(0.5 is half), not the task-time view in the app's timeline; they need Nx 22.1
or later. It costs one more request per 5,000 CIPEs in the window.

Each CIPE has the same numbers on its `compute` field: `credits` (`total`,
`byResourceClass`, and `complete`), `vmMinutes` (`vmMinutesComplete`),
`workerCount` and the utilizations. They are filled in about 20 minutes after
the CIPE completes. `compute` is null for a CIPE that used no workers, such
as one whose tasks all came from the cache.

For the organization's bill, `npx nx-cloud org usage --daily` shows the month's
usage as the Usage page does (organization admins only). It is per
organization and month, and includes compute outside CIPEs, so it won't match
the sum of `cipe-stats` credits for the same days.

## Trend

Compare two windows of the same length, measured the same way: credits and VM
minutes per CIPE (average and p50/p95), and the CIPE count. Total credits can
rise only because more pipelines ran. Split the default branch from PRs, and
tie a step change to its date and a change in `.nx/workflows` or CI config.

## One pipeline's workers

The run groups with workers are the ones with a `workerCount` above zero
(`views/v0/pipeline-status/{cipeId}` lists a CIPE's run groups); follow their
`links.workers`. Each worker has its `launchTemplate`, `cpuCores`,
`onlineAt`/`offlineAt`, `avgCpu`/`maxCpu` (percent, 100 per full core) and
`avgMemory`/`maxMemory` (bytes, against `totalMemory`). With the tasks of the
pipeline, which carry `workerName`, `startedAt` and `completedAt`, work out per
worker:

- **startup:** from the run group's creation to `onlineAt`, and to its first
  task;
- **busy:** the union of its tasks' intervals, over its online time. Leave
  out `continuous` tasks (dev servers for e2e), which run for as long as their
  consumers;
- **idle tail:** from its last task to `offlineAt`.

Low busy time on many workers points at a fleet larger than the work, or a
long task that everything else waits for (see `sharding.md`). Low `avgCpu` with
high busy time suggests a smaller resource class or more parallelism per
worker; `maxMemory` near the limit suggests the opposite. Compare runs that did
the same amount of work (similar summed cache-miss time), not just the same
branch.

## Suggest

Changes live in `.nx/workflows/*.yaml` (launch templates, resource classes)
and the `--distribute-on` argument of `nx-cloud start-ci-run` (fleet size, by
changeset size). State the expected effect on wall time and credits, and how to
measure it after the change.
