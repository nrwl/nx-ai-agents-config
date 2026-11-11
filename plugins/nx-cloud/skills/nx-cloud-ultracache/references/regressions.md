# When a task got worse, and why

1. Confirm it: compare the task's miss rate and miss minutes in two windows from `task-stats`, or
   count misses in `earlier-executions` on the default branch. Give both numbers.
2. Date it: walk the executions in time order and find where misses start following a new kind of
   change. Check the task's config on pipelines before and after (see
   [learned-inputs.md](learned-inputs.md)): a different `learnedAtCommit` and `inputCount` means it
   relearned at that commit.
3. Explain it: diff the old and new configs' `inputs`, and diff the hash details of a miss after the
   change (see [explain-a-miss.md](explain-a-miss.md)). A new input that changes often is the usual
   cause; the commit that introduced it is in `learnedAtCommit`.

Separate the regression from misses the task always had, and say which misses each one explains.
