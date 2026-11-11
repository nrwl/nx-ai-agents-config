# Why one execution missed

A miss means the task's hash was new. Compare it with the closest earlier execution that had a
different hash:

1. `/nx-cloud/data/v0/runs/{runId}/tasks/{taskId}/earlier-executions` (pass `branch` to stay on the
   same branch). The response has `current` and `earlier` (newest first, `limit` up to 50), not
   `items`. Take the newest `earlier` entry with `sameHash: false`.
2. Download both executions' `links.hashDetails` (gzipped JSON with `nodes`, `runtime` and
   `implicitDeps`, each a map from a hashed input to its hash). Two files are enough; don't fetch
   the whole history for one miss.
3. Diff the maps:

```sh
jq -n --slurpfile a <(gunzip -c "$dir/before.json.gz") --slurpfile b <(gunzip -c "$dir/now.json.gz") '
  ["nodes", "runtime", "implicitDeps"][] as $m
  | ($a[0][$m] // {}) as $x | ($b[0][$m] // {}) as $y
  | (($x | keys) + ($y | keys) | unique)[] | select($x[.] != $y[.])
  | {map: $m, input: ., before: $x[.], now: $y[.]}'
```

Changed keys are the cause. A `nodes` key can name a whole glob, so the data cannot always name the
file; say so, and use the task's config and the commit titles (`vcsContext.title` on the pipelines)
to narrow it. A `runtime` or `implicitDeps` change is not a file the task read: an environment
value, a command's output, or a workspace-level file. Hash details are kept for about 14 days.
