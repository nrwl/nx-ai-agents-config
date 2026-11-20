# When a task got worse, and why

1. Confirm it with complete counts over two explicit windows, not with `earlier-executions` (a
   capped, unpaginated sample). Across all branches, compare the target's miss rate and miss
   minutes in `task-stats` for the two windows. For one branch, count the task's misses in that
   branch's runs for each window (see [miss-cost.md](miss-cost.md)). Give both numbers.
2. Date it: check the task's config on pipelines before and after (see
   [learned-inputs.md](learned-inputs.md)). A different `learnedAtCommit` and `inputCount` means it
   relearned at that commit. Use `earlier-executions` only to pick executions to compare around that
   point.
3. Explain it: diff the old and new configs' `inputs`, and diff the hash details of a miss after the
   change (see [explain-a-miss.md](explain-a-miss.md)). A new input that changes often is the usual
   cause; the commit that introduced it is in `learnedAtCommit`.

Separate the regression from misses the task always had, and say which misses each one explains.
