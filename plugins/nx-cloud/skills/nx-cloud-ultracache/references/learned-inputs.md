# What a task depends on

A pipeline pins the configs its tasks hashed with. Take a recent successful pipeline on the
branch in question (`cipes` with `branch` and `statuses=SUCCEEDED`), then list its configs:

- `/nx-cloud/data/v0/cipes/{cipeId}/ultracache` lists tasks largest `inputCount` first; filter with
  `projectName` or `taskId`. `state` must be `PINNED`. `DISABLED` means Ultracache was off for that
  pipeline; `NOT_PINNED` means none of its tasks read configs. Try one or two earlier pipelines, then
  stop and report that the workspace isn't using Ultracache there.
- Each task's `links.config` downloads a gzipped JSON `{inputs, outputs}`. Save it with an explicit
  name such as `-o "$dir/config.json.gz"` and read it with `gunzip -c`; it is not a tar.
- `learnedAtCommit` is where the config was learned. Configs are inherited along history, so it is
  often older than the pipeline's commit; a newer value on a later pipeline means the task relearned.

`inputCount` is absent on pipelines pinned before it was recorded, and it counts exclusions (globs starting with an exclamation mark) too,
so a larger count can mean narrower inputs. A very small config for a task that clearly reads source
code (only wrapper or settings files) is suspicious in itself: the task may have read its sources in
a process the trace did not see.

`inputs` are workspace-relative paths and globs (a leading exclamation mark excludes). Summarise them before reading:
count by the first two path segments and by extension, and list the globs.

Look for reads the task's result should not depend on: other projects' sources, docs, the task's
own outputs or reports (coverage, caches), generated files, and repo-wide globs. Name the input and
how much of the config it accounts for.
