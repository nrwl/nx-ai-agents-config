# Flaky tasks

A flaky task fails and passes on the same inputs. Nx Cloud records this per
task and UTC day in `flaky-tasks`, from CI cache misses only.

## Rank

Each `flaky-tasks` row is one task (project, target, configuration) on one day:

- `flakinessRate`: the share of successful cache misses whose input hash also
  failed that day. `sampleSizeFlakinessRate` is its denominator.
- `totalReruns`: repeat cache misses of the same hash that day, including
  hashes that never failed; not a count of retries. `deflakedAutomatically`:
  hashes that both failed and passed within one Nx execution, usually Nx
  Cloud's automatic retry. It doesn't prove the last attempt passed.
- `isCacheable: false` rows can look flaky while the hash stays the same; leave
  them out (see the counting rules in `nx-cloud-api`).

`minFlakinessRate` drops the zero-rate rows. `windowEndBefore` set to yesterday
leaves out today's incomplete row.

Rank by time lost, not by rate: `deflakedAutomatically` over the window times
the task's typical miss duration, from `task-stats` (`durationPercentiles` p50,
or `averageDuration.cacheMissMs` weighted by misses). It misses flakes fixed by
rerunning the whole pipeline, so it is a lower bound. `flaky-tasks` has no
durations, so read `task-stats` only for the projects of the tasks with the
most reruns. A flake that fails by timing out costs its timeout, not the
typical duration; the failed attempts' `startedAt` and `completedAt` in
`priorAttempts` give the real cost.

Count the days it flaked, too: a task flaky every day is a different problem
from a one-day burst, which is more likely an incident (an outage, a bad
dependency release).

## Evidence

`links.executions` of a row lists the distributed Nx executions (runs) behind
it, including ones where the task never failed. To find the failed attempts,
read those runs' copies of the task in one request with `batch/v0/run-tasks`
(`-f run=<id>` repeated, up to 25), filtered with `-f taskId=<id>` and
`-f retried=true` (failed, then passed on a retry) or `-f statuses=FAILED`.
The number found need not match `totalReruns`: non-distributed runs count
toward the metric but are not listed.

Read a failed attempt's log with the CLI:

```sh
NX_CLOUD_EXPERIMENTAL_CLI=true npx nx-cloud pipeline task logs <runId> <taskId> --attempt 0 -o <file>
```

Compare the failing part of several logs. The same test and assertion each time
points at the test or the code; different tests failing in one target point at
the environment (memory, CPU, ports, a shared service, test order).

When `links.executions` is empty, look at `runs` with `hasRetriedTasks=true`
in the same window.

## Suggest

Name the test and the failing assertion, the likely cause, and the owner
(`CODEOWNERS`, or the project's tags). A fix needs the source; a log alone only
supports a hypothesis. Typical fixes: wait for a condition instead of a
timeout, isolate shared state or ports, raise a resource the task runs out of,
or quarantine the test while it is fixed.

A recurring report can tell new flakes from known ones by comparing with the
previous window, or with issues it opened before.
