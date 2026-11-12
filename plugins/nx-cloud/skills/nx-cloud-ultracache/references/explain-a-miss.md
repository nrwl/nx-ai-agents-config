# Why one execution missed

1. List earlier executions of the task:
   `/nx-cloud/data/v0/runs/{runId}/tasks/{taskId}/earlier-executions` (pass `branch` to stay on the
   same branch). The response has `current` and `earlier` (newest first, `limit` up to 50), not
   `items`. With `branch`, the server scans only a few times `limit` recent executions on all
   branches before filtering, so an empty `earlier` on a busy branch means "none found nearby",
   not "none exist".
2. Check for an earlier execution with `sameHash: true` first. If one exists, the inputs did not
   change: the cache had the hash but did not replay it. That is a replay question, not an input
   question: follow `nx-cloud-cache-investigator` ("Same computation, replay not established").
3. Otherwise the hash was new. Take the newest `earlier` entry with `sameHash: false`, download both
   executions' `links.hashDetails` (gzipped JSON with `nodes`, `runtime` and `implicitDeps`, each a
   map from a hashed input to its hash; two files are enough for one miss), and diff the maps:

```bash
gunzip -c "$dir/before.json.gz" > "$dir/before.json"
gunzip -c "$dir/now.json.gz" > "$dir/now.json"
jq -n --slurpfile a "$dir/before.json" --slurpfile b "$dir/now.json" '
  ["nodes", "runtime", "implicitDeps"][] as $m
  | ($a[0][$m] // {}) as $x | ($b[0][$m] // {}) as $y
  | (($x | keys) + ($y | keys) | unique)[] | select($x[.] != $y[.])
  | {map: $m, input: ., before: $x[.], now: $y[.]}'
```

Changed keys show what Nx hashed differently. A `nodes` key usually names a whole file set (a
project's sources, for example), so the data cannot always name the file; say so, and use the
task's config and the commit titles (`vcsContext.title` on the pipelines) to narrow it. A `runtime`
or `implicitDeps` change is not a file the task read: an environment value, a command's output, or
a workspace-level file.

A 404 naming "hash details" from either operation means the execution's hash details expired (they
are kept for about 14 days) or were never recorded, not that an ID is wrong. Report that, and fall
back to the investigator's "Needs diagnostic run".
