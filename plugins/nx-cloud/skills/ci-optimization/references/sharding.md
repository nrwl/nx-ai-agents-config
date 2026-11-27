# Tasks to atomize or shard

A long task that runs in most pipelines holds up a worker, and often the
critical path, however many workers there are. Splitting it lets Nx Cloud
spread the pieces across workers and cache each one on its own.

## Find candidates

From `task-stats` with `isCI=true` and `percentiles=50` and `95`, summed over
the window per project and target:

- long: a high p50 and p95 `cacheMissMs`;
- often run: a high `totalCount` with a high `cacheStatusRatio.cacheMiss`, so
  the long run is paid often;
- not split yet: no sibling targets such as `e2e-ci--<file>` or
  `test-ci-group-<n>` exist.

Rank by miss time: misses (`totalCount` × `cacheMiss`) × p50. A p95 far above
p50 means the duration depends on the change (affected files, a cold service)
more than on the target's size; splitting helps less there. Percentiles are
per day; compare days rather than averaging them.

A target that is already sharded can still be a finding: when its shards'
durations differ widely, the slowest one sets the pace, and balancing them by
duration helps more than adding shards.

To check a candidate is on the critical path, compare its duration with the
pipeline's (`npx nx-cloud pipeline get <id>`).

## Suggest

Read the target in a checkout (`nx show project <name> --json`): its executor or
command, and the plugin that infers it.

- **Atomizer** splits a test or e2e target into one task per file. The inferred
  targets of `@nx/jest`, `@nx/vitest`, `@nx/vite`, `@nx/playwright` and
  `@nx/cypress` get it from the plugin's `ciTargetName` option in `nx.json`;
  CI then runs the `ciTargetName` target instead. Docs:
  https://nx.dev/docs/kb/split-e2e-tasks
- **Sharding** splits the target into a fixed number of targets, each running
  one share of the tests with the runner's own option (`--shard=i/n` in Jest,
  Vitest and Playwright). It suits runners or projects Atomizer can't split,
  and very many small test files, where per-file startup would dominate.

Measure the effect afterwards: the split targets' summed miss time, the
slowest piece, and the pipeline duration, against a window before the change.
