# Cache misses and broad inputs

Time spent on cache misses that could have been hits is the cheapest CI time to
save.

## Rank

From `task-stats` with `isCI=true`, summed per project and target over the
window:

- misses: `totalCount` × `cacheStatusRatio.cacheMiss`;
- miss time: misses × `averageDuration.cacheMissMs`;
- hit rate: `localCacheHit` + `remoteCacheHit`, weighted by `totalCount`.

Rank by miss time. A low hit rate on a fast task matters little.

`task-stats` covers only cache-enabled runs, but it doesn't say whether a
target is cacheable: a target that misses every time may simply be `cache:
false`. Check with `cacheable` on one of its task records, or in the checkout.

## Tell the causes apart

Read a few of its missed tasks with their `hash` from `batch/v0/run-tasks`
(`-f cacheStatus=cache-miss`), for runs of known branches:

- **Code changes:** on PR branches each hash misses once. Expected; a narrower
  input set or more granular projects are the only levers.
- **Misses on the default branch:** a busy default branch combines changes no
  PR built together, so new hashes there are normal. Look further when a
  target misses on commits that didn't touch it or its dependencies: an input
  that changes every run (a timestamp, a generated file, an environment
  variable, `runtime` inputs), outputs that are not declared, or inputs that
  are too broad (below).
- **Same hash missed several times:** the cache was not used. Causes include
  the same task started in parallel before either finished, artifacts that
  failed to upload or download, and different access tokens or hash scopes in
  one pipeline. `nx-cloud-cache-investigator` covers these.
- **Inputs too broad:** the target hashes far more than it reads, so unrelated
  changes invalidate it. Read the resolved inputs in the checkout:
  `targets.<target>.inputs` in `nx show project <name> --json`, and
  `namedInputs` in `nx.json`. Common signs: the `default` named input
  (`{projectRoot}/**/*`) on a target that doesn't need tests, docs or config;
  `^default` instead of `^production`; workspace-wide globs; and a shared file
  every project depends on (a root `tsconfig`, a lockfile, a large barrel
  package).

The Data API does not expose which files went into a hash, so an inputs finding
comes from the checkout. Say so, and propose the narrower inputs as a change to
verify, not as proof.

## Suggest

Name the target, its hit rate and miss hours, the cause and how sure you are,
and the smallest change: a `production` named input, an excluded glob, a
declared output, or dropping a volatile input.
