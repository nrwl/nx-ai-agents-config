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
  hand or use an internal workflow ID as a route parameter.
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

Always check the exit code. Error bodies go to stderr unchanged; do not hide
stderr with `2>/dev/null`.

| Exit | Meaning                | Safe next action                                                                           |
| ---- | ---------------------- | ------------------------------------------------------------------------------------------ |
| 0    | Success                | Read the saved output.                                                                     |
| 1    | Usage or network error | Read stderr. Check the path, flags, host (`NX_CLOUD_API` or `nxCloudUrl`), proxy, and VPN. |
| 4    | Client error (4xx)     | Read the status and body on stderr (`-i` prints the status line). See the table below.     |
| 5    | Server error (5xx)     | Retry once after a short wait. Keep the endpoint, filters, and time range for support.     |

| Status | Safe next action                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 401    | The command needs an access token: a personal access token from `npx nx-cloud login` together with `nxCloudId` in `nx.json`, or a workspace token in `NX_CLOUD_ACCESS_TOKEN`. First run `npx nx-cloud login --status` from the workspace root. A stored personal access token takes precedence, so a stale one fails even when a valid workspace token is set. Run `npx nx-cloud login` only when the status check reports no usable login. |
| 403    | Confirm the workspace. Ask its administrator for access. Do not use another person's token.                                                                                                                                                                                                                                                                                                                                                 |
| 404    | Check the route with `--list-operations` and `--describe`, then the resource ID.                                                                                                                                                                                                                                                                                                                                                            |
| 409    | `not_terminal`: the entity is still running. Its data is not final yet.                                                                                                                                                                                                                                                                                                                                                                     |
| 429    | Already retried by the command. Narrow filters or wait before another request.                                                                                                                                                                                                                                                                                                                                                              |

`--list-operations`, `--describe`, and `--print-api-spec` do not need
credentials, so they succeed even when data requests fail with 401.

Do not alter workspace configuration or credentials without the user's explicit
request.

## Same-session retry

The command already retries 429 and 503. For a 409 on a known request, arrange
at most one same-session wake after the named parent is expected to finish.
Preserve the link and filters. Stop at a terminal response.

## Pagination

Without `--paginate` the command returns one page as JSON. A non-null
`nextCursor` means more results exist; state that the data is incomplete or
fetch more only when the question needs it.

With `--paginate` the command follows `nextCursor` and writes one item per line
(NDJSON) with no page metadata. Always set `--max-items` to a bound you can
justify, and use narrow filters. Do not fetch all `flaky-tasks` or `task-stats`
pages without one. If the item count equals `--max-items`, assume more data
exists. A non-zero exit leaves partial NDJSON behind; treat it as incomplete.

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
