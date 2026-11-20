# Which single change would save the most

A cause can hit one task or many. Attribute misses to causes before you compare them, on a bounded
sample:

1. Rank tasks by miss time ([miss-cost.md](miss-cost.md)) and keep the top ones (about ten) that
   together hold most of the time.
2. For those tasks, walk their executions in the window in time order and diff each miss's hash
   details against the previous execution ([explain-a-miss.md](explain-a-miss.md)), reusing each
   downloaded file as the next one's "before". Skip misses whose hash was already seen: they are
   replay questions, not input changes. Group the misses by changed key and add up their minutes.
   A key that changes in many tasks at once, often in `implicitDeps` or `runtime`, points to a
   shared cause such as a root file or an environment value. Stop and say so if the requests run
   into rate limits; report the sample you covered.
3. Check which commits the changes line up with (`vcsContext.title`), so you can name the cause.
4. Estimate the saving by replay: for each task, walk its executions with the cause's key removed
   from the hash details, and count a miss as avoided when the remaining inputs match any earlier
   execution's. Add up the avoided misses' minutes, scale to the period asked for, and show the
   arithmetic. Counting only misses where that key alone changed underestimates it.

Compare the top causes and say which one to address first, and what would remain. Any input
exclusion or narrowing you suggest still has to pass the change gate in
`nx-cloud-cache-investigator`.
