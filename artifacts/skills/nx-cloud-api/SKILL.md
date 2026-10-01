# Nx Cloud API

Answer a defined workspace-data question with `npx nx-cloud api`, the read-only
Nx Cloud Public API command. This is an API access skill, not a report generator
or configuration editor. Run every command from the workspace root so the
command finds `nx.json`.

Run `npx nx-cloud api --help` once for syntax and options. This skill covers the
workflow around it.

## Non-negotiable rules

- Discover endpoints from the live spec. Use `npx nx-cloud api --list-operations`
  to find a route and `npx nx-cloud api --describe <operationId | path | link>`
  for its parameters, response fields, and error statuses. Do not use
  remembered routes, fields, filter names, or enum values.
- Start at `cipes` and follow returned `links` values. Do not build child URLs by
  hand or use an internal workflow ID as a route parameter. When you must
  address an entity by ID, use the `{placeholder}` path from `--describe` and
  fill it with `-p name=value`. Never paste an ID into a path: IDs are raw and
  can contain `/` or `:` (task IDs like `@scope/app:build`).
- Start with one filtered page. Ask for a workspace, scope, or time range when
  they are missing. Do not collect history by default.
- Read the operation description from `--describe`. It states server limits that
  the command does not enforce.
- Never put a token in a command, variable, chat message, or log.
- Do not use this skill to poll or monitor live CI.

## Cache boundary

The API returns recorded task and run fields. It does not query the local Nx
target. `cacheEnabled` describes the recorded run. `cacheable` describes the
recorded task. Neither value identifies `targetDefaults`, an inferred target,
or Vite, ESLint, or another tool-native cache.

Do not infer `cache: false` from an absent project property. For cache causes,
target settings, inputs, outputs, or a configuration change, use
`nx-cloud-cache-investigator`. API data alone cannot justify a cache or inputs
pull request.

## Quick workflow

```sh
npx nx-cloud api --describe cipes

# Save one bounded page to a private file, then project only what you need.
dir="$(mktemp -d)"
npx nx-cloud api cipes \
  -f createdAfter=2026-08-01T00:00:00Z \
  -f statuses=FAILED -f statuses=CANCELED \
  -o "$dir/cipes.json"
echo "exit $?"
jq '{nextCursor, items: [.items[] | {id, status, createdAt, links}]}' "$dir/cipes.json"

# Follow a link from a previous response as-is.
npx nx-cloud api "<link from a previous response>" -o "$dir/next.json"

# Address an entity by ID only through a path parameter.
npx nx-cloud api 'runs/{runId}/tasks' -p runId="$run_id" -o "$dir/tasks.json"
```

Pass a `links.*` value exactly as returned; it may already carry query
parameters, and `-f` adds more. Full URLs are accepted only on the configured
Nx Cloud host.

## Keep API output compact

Write every live data response to a private file with `-o` (for example under a
`mktemp -d` directory) and read a question-specific `jq` projection. Do not let
a raw collection print into the conversation unless the user asks for it.
Choose projected fields from `--describe`. For one row, select it first, then
project only the needed fields. Delete saved data when the task is done unless
the user asks to keep it.

`--describe` output is usually small. Pipe it through `jq` only when you need
part of a large operation.

## Exit codes and errors

Always check the exit code. The command passes the server's error body to
stderr unchanged and adds no recovery hints; do not hide stderr with
`2>/dev/null`. Exit 4 and 5 bodies are JSON with a stable `code` field (except
401 and an empty-body 429); branch on `code`, not on the prose `message`.

| Exit | HTTP | `code`                                                                                               | Next action                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ---- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | —    | —                                                                                                    | Usage or network error; nothing reached the API. Read the `nx-cloud api:` message on stderr. Fix the flags, path, or `-p` values, or check the host (`NX_CLOUD_API` or `nxCloudUrl`), proxy, and VPN.                                                                                                                                                                                                       |
| 4    | 400  | `invalid_parameter`                                                                                  | Run `npx nx-cloud api --describe <same path>` and fix the named parameter. Unknown query parameters are always rejected.                                                                                                                                                                                                                                                                                    |
| 4    | 400  | `invalid_limit`, `invalid_timestamp`, `invalid_date_range`, `invalid_filter`                         | Fix the value or filter combination named in `message`, using `--describe` for formats and limits.                                                                                                                                                                                                                                                                                                          |
| 4    | 400  | `invalid_cursor`                                                                                     | A cursor is valid only for the list that minted it. Resume with the same path and filters, or restart without `cursor`.                                                                                                                                                                                                                                                                                     |
| 4    | 401  | none (plain-text body)                                                                               | Run `npx nx-cloud login --status` from the workspace root. The command needs a personal access token from `npx nx-cloud login` with `nxCloudId` in `nx.json`, or a workspace token in `NX_CLOUD_ACCESS_TOKEN`. A stored personal access token takes precedence, so a stale one fails even when a valid workspace token is set. Run `npx nx-cloud login` only when the status check reports no usable login. |
| 4    | 403  | `plan_not_allowed`                                                                                   | The organization's plan does not include the Nx Cloud Public API. Tell the user; do not retry or use another person's token.                                                                                                                                                                                                                                                                                |
| 4    | 404  | `not_found`                                                                                          | The ID in the path or in a parent-ID filter (`cipeId`, `runGroup`, `stepId`, `agentName`) is wrong. An unknown parent is never an empty result. Recheck the ID, or follow a link instead.                                                                                                                                                                                                                   |
| 4    | 404  | none (empty body)                                                                                    | The path matched no route, usually because a raw ID containing `/` (such as `@scope/app:build`) was pasted into it. Use the `{placeholder}` path with `-p`, or follow `links`, and check the path with `--describe`.                                                                                                                                                                                        |
| 4    | 409  | `not_terminal`                                                                                       | The entity is still running. This is not a failure; its data is not final yet. See same-session retry below.                                                                                                                                                                                                                                                                                                |
| 4    | 429  | `rate_limit_exceeded` or empty body                                                                  | The organization-wide quota is exhausted. The command already retried 3 times honoring `Retry-After`. Back off, narrow filters, and make fewer requests.                                                                                                                                                                                                                                                    |
| 5    | 503  | `data_api_at_capacity`, `query_deadline_exceeded`, `audit_log_unavailable`, `rate_limit_unavailable` | No data was returned. The command already retried 3 times. Back off before one more attempt; for `query_deadline_exceeded`, narrow the time range or filters.                                                                                                                                                                                                                                               |
| 5    | 5xx  | other                                                                                                | Retry once after a short wait. Keep the endpoint, filters, time range, and `traceId` from the body for support.                                                                                                                                                                                                                                                                                             |

`--list-operations`, `--describe`, and `--print-api-spec` do not need
credentials, so they succeed even when data requests fail with 401.

Do not alter workspace configuration or credentials without the user's explicit
request.

## Same-session retry

For a 409 `not_terminal` on a known request, arrange at most one same-session
wake after the entity is expected to finish. Preserve the link and filters.
Stop at a terminal response.

## Pagination

Every list response, with or without `--paginate`, is one JSON object
`{"items": [...], "nextCursor": ...}`. Read rows with `jq '.items[]'`. The list
is complete only when the exit code is 0 and `nextCursor` is `null`. Otherwise
state that the data is incomplete, or continue with `-f cursor=<nextCursor>` on
the same path and filters.

Without `--paginate` the command returns one page. With `--paginate` it follows
`nextCursor` and merges the pages into one object, stopping at 10000 items by
default. Pass a smaller `--max-items` when a sample answers the question. Use
`--max-items 0` (no cap) only when you truly need every item, and use narrow
filters either way; do not fetch all `flaky-tasks` or `task-stats` pages
unfiltered. Leave `limit` unset with `--paginate` so the command uses 500 per
page; every page costs one unit of the organization's rate limit, so a small
`-f limit` multiplies requests. The returned `nextCursor` resumes exactly after
the last returned item. If a later page
fails, stdout still holds the items read so far and the cursor of the failed
page, and the exit code is 4 or 5; resume from that cursor after handling the
error.

For multi-range extraction, task or log assets, or a calculation, read
[references/extraction-and-calculation.md](references/extraction-and-calculation.md)
first.

## Interpret responses

Collection responses have top-level `items` and `nextCursor`. Single resources
are returned as-is. Do not infer a field meaning from its name; check
`--describe` and a live record first.

Label cache statements by evidence source:

- **API response field:** a recorded `cacheEnabled`, `cacheable`, cache-status,
  or hash value.
- **Nx target query:** a value from `nx show project ... --json` in a matching
  checkout.
- **Tool-native cache:** `Unknown` until its executor options are inspected.

## Empty task assets

A valid task asset can have zero-byte terminal output and no output files;
`nx:noop` commonly does. Check the matching workspace task before reporting a
log-capture or archive defect.

## Report

State the operations queried, filters, item counts, and whether the data is
complete. State whether a result is recorded API data, a local target query, or
a hypothesis. Never claim that an API-only read proved configuration provenance
or tool-native cache state.
