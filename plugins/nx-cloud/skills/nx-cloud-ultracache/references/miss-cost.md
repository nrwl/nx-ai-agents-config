# Which tasks cost the most through misses

Pick the source by the question's scope:

- **All branches:** `task-stats` returns one row per target per UTC day, for CI and local runs
  separately, across every branch. A row's miss time is
  `totalCount * cacheStatusRatio.cacheMiss * averageDuration.cacheMissMs`. Set the window
  (`-f dateAfter=<today minus 7 days>`, `-f isCI=true`), fetch every page, sum per
  `projectName:target` and rank.
- **One branch, such as main:** `task-stats` cannot filter by branch. List that branch's runs in the
  window (`runs` with `branch` and a `createdAt` window) and add up the cache misses from each run's
  tasks (`runs/{runId}/tasks` with `cacheStatus=cache-miss`), using each task's start and end times.
  Leave out continuous tasks and tasks that are not `cacheable`: they "miss" on every run and say
  nothing about the cache. Many runs means many calls; fetch them in one loop and save each page.

```sh
jq -r '[.items[] | {t: "\(.projectName):\(.target)",
    misses: (.totalCount * .cacheStatusRatio.cacheMiss),
    ms: (.totalCount * .cacheStatusRatio.cacheMiss * .averageDuration.cacheMissMs)}]
  | group_by(.t) | map({t: .[0].t, misses: (map(.misses) | add), min: ((map(.ms) | add) / 60000)})
  | sort_by(-.min) | .[:15][] | "\(.min | floor) min\t\(.misses | round) misses\t\(.t)"' "$dir/stats.json"
```

Report misses and minutes, the window and the source you used. A target that misses on every run
can still be cheap; one that misses a few times for minutes each is usually the better target.
Families of split tasks (such as `e2e-ci--<file>`) can cost more together than any single target.
