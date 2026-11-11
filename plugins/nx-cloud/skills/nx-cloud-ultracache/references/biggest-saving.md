# Which single change would save the most

A cause can hit one task or many. Attribute misses to causes before you compare them:

1. Rank tasks by miss time ([miss-cost.md](miss-cost.md)) to know where time goes.
2. For each run in the window and each task that missed, diff its hash details against its previous
   execution ([explain-a-miss.md](explain-a-miss.md)). Group the misses by the changed key, and add
   up their minutes. A key that changes in many tasks at once, often in `implicitDeps` or `runtime`,
   points to a shared cause such as a root file or an environment value.
3. Check which commits the changes line up with (`vcsContext.title`), so you can name the cause.
4. Estimate the saving by replay: for each task, walk its executions in time order with the cause's
   key removed from the hash details, and count a miss as avoided when the remaining inputs match
   any earlier execution's. Add up the avoided misses' minutes, scale to the period asked for, and
   show the arithmetic. Counting only misses where that key alone changed underestimates it.

Compare the top causes, recommend one, and say what else would remain.
