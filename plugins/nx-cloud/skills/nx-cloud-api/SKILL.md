---
name: nx-cloud-api
description: Query the read-only Nx Cloud Public API for workspace data with `npx nx-cloud api`. Use this skill when a user asks to inspect or retrieve CIPEs, pipelines, run groups, runs, tasks, workflows, agents, task statistics, flaky tasks, cache data, CI compute or credit estimates, or API endpoint details. Use this skill before any Nx Cloud API call. It covers endpoint discovery, link navigation, pagination, asset downloads, and error recovery. Do not use it for live CI monitoring.
---

# Nx Cloud API

Answer a defined workspace-data question with `npx nx-cloud api`, the read-only
Nx Cloud Public API command. This is an API access skill, not a report generator
or configuration editor. Run every command from the workspace root so the
command finds `nx.json`, or pass `--nxCloudId <id>` to name the workspace
(see Authentication).

Run `npx nx-cloud api --help` (or `npx nx-cloud api` alone) once for syntax and
options. This skill covers the workflow around it.

All output is JSON. stdout carries only the response data. stderr carries one
JSON object per line: `{"error": ...}`, `{"output": ...}`, and, with `-i` or
`NX_VERBOSE_LOGGING`, `{"response": ...}` and `{"log": ...}`. The one exception
is an asset download, whose raw bytes go to the `-o` file.

## Non-negotiable rules

- Discover endpoints from the live spec. Use `npx nx-cloud api --list-operations`
  to find a route and `npx nx-cloud api --describe <operationId | path | link>`
  for its parameters, response fields, and error statuses. Both show what an
  operation `returns`: `list` (the wrapped list below), `object` (the response
  body), or `file` (an asset download). Do not use
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
- Do not use this skill to poll or monitor live CI.
- Only read. `--list-operations` also lists actions (`method: POST`, such as
  `ci/{ciExecutionId}/rerun`); take one only when the user asks for it.

## Authentication

`npx nx-cloud api` authenticates for you; do not read credentials out of
`nxcloud.ini` or call the API with `curl`. It sends the first available of:

1. A workspace token in `NX_CLOUD_ACCESS_TOKEN` (or `NX_CLOUD_AUTH_TOKEN`). When
   one is set, the command uses it alone and ignores any stored login.
2. The user's OAuth login from `npx nx login`, refreshed as needed.
3. A personal access token stored in `nxcloud.ini` by an older login.

A login or personal access token also needs the workspace's Nx Cloud ID, sent
as `Nx-Cloud-Id`. The command reads it from `nxCloudId` in `nx.json`;
`--nxCloudId <id>` overrides it, so you can query a workspace you are a member
of without its checkout. The command still reads an `nx.json` in the current
directory, so outside a checkout run it from a scratch directory holding an
`nx.json` of `{}`, with `NX_CLOUD_API` set to the workspace's Nx Cloud host
when it is not `https://cloud.nx.app`. A workspace token always reads its own
workspace and ignores the ID.

If you must call the API without the command, the headers differ per
credential, and an OAuth access token is not a bearer token:

| Credential            | Headers                                                           |
| --------------------- | ----------------------------------------------------------------- |
| Workspace (CI) token  | `Authorization: Bearer <token>`                                   |
| OAuth access token    | `Nx-Cloud-OAuth-Access-Token: <token>` and `Nx-Cloud-Id: <id>`    |
| Personal access token | `Nx-Cloud-Personal-Access-Token: <token>` and `Nx-Cloud-Id: <id>` |

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

# Save one bounded page to a scratch file, then project only what you need.
dir="$(mktemp -d)"
npx nx-cloud api cipes \
  -f createdAfter=2026-08-01T00:00:00Z \
  -f statuses=FAILED -f statuses=CANCELED \
  -o "$dir/cipes.json"
echo "exit $?"
jq '{pageLimitReached, nextCursor, items: [.items[] | {id, status, createdAt, links}]}' "$dir/cipes.json"

# Follow a link from a previous response as-is.
npx nx-cloud api "<link from a previous response>" -o "$dir/next.json"

# Address an entity by ID only through a path parameter.
npx nx-cloud api 'runs/{runId}/tasks' -p runId="$run_id" -o "$dir/tasks.json"
```

Pass a `links.*` value exactly as returned; it may already carry query
parameters, and `-f` adds more. Full URLs are accepted only on the configured
Nx Cloud host. That includes app links such as `https://cloud.nx.app/cipes/<id>`,
which resolve like the bare path `cipes/<id>`.

## Keep API output compact

To preserve context, write every live data response to a file with `-o` (files are created
owner-only) in a scratch directory outside the workspace. Give the file an
extension. A name without one gets `.json`, `.ndjson`, or the download's own
(such as `.tar.gz`), and the command reports the final path on stderr as
`{"output": {"file": "..."}}`. Create the scratch directory with `mktemp -d`,
and read a question-specific `jq` projection. Do not let
a raw collection print into the conversation unless the user asks for it.
Choose projected fields from `--describe`. For one row, select it first, then
project only the needed fields. Delete saved data when the task is done unless
the user asks to keep it.

`--describe` output is usually small. Pipe it through `jq` only when you need
part of a large operation.

## Exit codes and errors

Always check the exit code. Every failure prints one record on stderr, and the
command adds no recovery hints; do not hide stderr with `2>/dev/null`:

```text
{"error":{"type":"http","message":"HTTP 409 Conflict","status":409,"url":"...","body":{"code":"not_terminal","message":"..."}}}
```

`type` is `usage`, `http`, `network`, `response` (an answer the command cannot
use), or `output` (an unwritable `-o` file). For `http`, `body` is the server's
error body, parsed when it is JSON and absent when it is empty. Exit 4 and 5
bodies carry a stable `code` (except 401 and an empty-body 429); branch on
`.error.body.code`, not on the prose `message`.

| Exit | HTTP | `code`                                                                                               | Next action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---- | ---- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | —    | —                                                                                                    | Usage, network, response, or output error; read `.error.type` and `.error.message` on stderr. Fix the flags, path, or `-p` values, or check the host (`NX_CLOUD_API` or `nxCloudUrl`), proxy, and VPN.                                                                                                                                                                                                                                                                                                      |
| 4    | 400  | `invalid_parameter`                                                                                  | Run `npx nx-cloud api --describe <same path>` and fix the named parameter. Unknown query parameters are always rejected.                                                                                                                                                                                                                                                                                                                                                                                    |
| 4    | 400  | `invalid_limit`, `invalid_timestamp`, `invalid_date_range`, `invalid_filter`                         | Fix the value or filter combination named in `message`, using `--describe` for formats and limits.                                                                                                                                                                                                                                                                                                                                                                                                          |
| 4    | 400  | `invalid_cursor`                                                                                     | A cursor is valid only for the list that minted it. Resume with the same path and filters, or restart without `cursor`.                                                                                                                                                                                                                                                                                                                                                                                     |
| 4    | 401  | none (`body` is plain text)                                                                          | When `NX_CLOUD_ACCESS_TOKEN` is set, `nx-cloud api` sends that token alone, so the 401 means the token is invalid or has no access to this workspace; tell the user. Otherwise `nx-cloud api` sends the user's Nx Cloud login for this host with `nxCloudId` from `nx.json`: run `npx nx-cloud login --status` from the workspace root, and when it does not report the user as logged in, ask them to run `npx nx login`, which signs in by approving a code in the browser, and to follow what it prints. |
| 4    | 403  | `plan_not_allowed`                                                                                   | The organization's plan does not include the Nx Cloud Public API. Tell the user; do not retry or use another person's token.                                                                                                                                                                                                                                                                                                                                                                                |
| 4    | 404  | `not_found`                                                                                          | The ID in the path or in a parent-ID filter (`cipeId`, `runGroup`, `stepId`, `agentName`) is wrong. An unknown parent is never an empty result. Recheck the ID, or follow a link instead.                                                                                                                                                                                                                                                                                                                   |
| 4    | 404  | none (no `body`)                                                                                     | The path matched no route, usually because a raw ID containing `/` (such as `@scope/app:build`) was pasted into it. Use the `{placeholder}` path with `-p`, or follow `links`, and check the path with `--describe`. For a batch read or view, the cluster may not have it yet; see Bulk reads.                                                                                                                                                                                                             |
| 4    | 409  | `not_terminal`                                                                                       | The entity is still running. This is not a failure; its data is not final yet. See same-session retry below.                                                                                                                                                                                                                                                                                                                                                                                                |
| 4    | 429  | `rate_limit_exceeded` or no `body`                                                                   | The organization-wide quota is exhausted. The command already retried 3 times honoring `Retry-After`. Back off, narrow filters, and make fewer requests.                                                                                                                                                                                                                                                                                                                                                    |
| 5    | 503  | `data_api_at_capacity`, `query_deadline_exceeded`, `audit_log_unavailable`, `rate_limit_unavailable` | No data was returned. The command already retried 3 times. Back off before one more attempt; for `query_deadline_exceeded`, narrow the time range or filters.                                                                                                                                                                                                                                                                                                                                               |
| 5    | 5xx  | other                                                                                                | Retry once after a short wait. Keep the endpoint, filters, time range, and `traceId` from the body for support.                                                                                                                                                                                                                                                                                                                                                                                             |

`--list-operations`, `--describe`, and `--print-api-spec` do not need
credentials, so they succeed even when data requests fail with 401.

Do not alter workspace configuration or credentials without the user's explicit
request.

## Same-session retry

For a 409 `not_terminal` on a known request, arrange at most one same-session
wake after the entity is expected to finish. Preserve the link and filters.
Stop at a terminal response.

## Pagination

Every list response is wrapped, even a single page:
`{source, pagesFetched, fetchedItemCount, pageLimitReached, nextCursor, items}`.
`source` records the origin, endpoint, and original query. Read rows with
`jq '.items[]'`. Non-list responses are returned as-is.

The list is complete only when the exit code is 0 and `nextCursor` is `null`.
`pageLimitReached: true` means `--pages` stopped the run while more results
exist. To continue, rerun the same path and filters with
`--cursor <nextCursor>`, or state that the data is incomplete. The output's
`source.query` records the cursor it started from.

The command fetches one page by default. Raise `--pages` deliberately and keep
it small; prefer narrower filters over more pages. Do not fetch many
`flaky-tasks` or `task-stats` pages without a narrow filter. Leave the page size
alone unless needed: every page costs one unit of the organization's rate
limit, and `--page-size` (which sets `limit`, max 500) only helps when raised.

If a later page fails, the command still prints what it fetched, with
`nextCursor` at the failed page, and exits 4 or 5. Handle the error, then
resume from that cursor.

`--format ndjson` prints only the rows, one per line, with no metadata. Nothing
in its output says whether more pages exist, and it records no resume cursor. It prints each page as it is retrieved which can matter for responsiveness or very large responses.
Use it only when completeness does not matter; otherwise use the default JSON
output.

For multi-range extraction, task or log assets, or a calculation, read
[references/extraction-and-calculation.md](references/extraction-and-calculation.md)
first.

## Bulk reads

A batch read or a view answers in one request what otherwise takes one request
per run or task, and costs one unit of the rate limit whatever it returns. Use
one whenever you would otherwise loop over runs or tasks:

- **Why a pipeline failed, or where it stands:** the view
  `views/v0/pipeline-status/{cipeId}` returns the CIPE, its run groups and runs,
  and the failed and timed-out tasks of up to 25 failed or canceled runs, under
  `resources`. `complete: false` means it left something out; continue a list
  at its resource with its `nextCursor`, and read the failed tasks of the runs
  missing from `failedTasks` at their `links.tasks`.
- **The tasks of many runs:** `batch/v0/run-tasks`, with `-f run=<id>` repeated
  for up to 25 runs. Each item holds one run's first page in `tasks.items`, or
  its `error`; the task list's filters apply to every run. Continue a run at its
  `links.tasks` with the same filters.
- **The logs of many tasks:** `batch/v0/task-logs`, with
  `-f task=<runId>:<taskId>` repeated for up to 25 tasks from any runs. Each
  item holds a signed `url` of the log asset, or its `error`. `nx-cloud api`
  does not fetch that URL; download it as it is (`curl -sfL "$url" -o <file>`)
  and decode it as an asset (see the reference below). It takes no `batchId` or
  `attempt`; read another batch's or attempt's log at the task's own asset link.
- `batch/v0/task-dependencies` and `batch/v0/task-dependents` do the same for
  the task graph edges of up to 25 tasks.

An item's `error` fails only that run or task, with the `status` and `code` its
single-resource route would answer. Check each with `--describe` for its limits.

```sh
npx nx-cloud api 'views/v0/pipeline-status/{cipeId}' -p cipeId="$cipe_id" -o "$dir/status.json"
jq '{complete, cipeStatus,
     runGroups: [.resources.runGroups.items[] | {status, criticalErrorMessage}],
     failedTasks: [.resources.failedTasks[] | .runId as $r | .tasks.items[] | "\($r):\(.id)"]}' \
  "$dir/status.json"

# The logs of those failed tasks (at most 25) in one request.
args=()
while read -r t; do args+=(-f "task=$t"); done < <(
  jq -r '.resources.failedTasks[] | .runId as $r | .tasks.items[] | "\($r):\(.id)"' \
    "$dir/status.json" | head -n 25)
npx nx-cloud api batch/v0/task-logs "${args[@]}" -o "$dir/logs.json"
jq '.items[] | {runId, taskId, batchId, hasUrl: (.url != null), error}' "$dir/logs.json"
```

Enterprise (single-tenant) clusters do not have these routes yet. There a batch
read or view answers 404 with no `body`, and `--describe` does not know it. Fall
back to the single-resource routes: `cipes/{cipeId}` and its linked run groups
and runs, `runs/{runId}/tasks` per run, and each task's logs asset link. A 404
whose body has `code: not_found` is a wrong ID, not a missing route.

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

## Compute and credits

For how much compute CI used, start with `cipe-stats` (VM minutes and CPU and
memory utilization over a window) and each CIPE's `compute` field. The API has
no billing record. A run group's credits are the sum of `estimatedTotalCredits`
over its `workflows[]` (the deprecated `workflow` is only the first one). That
sum is an estimate of compute credits by launch template, not execution
credits or the invoice, and it is absent for run groups without a workflow
(such as on the customer's own runners). Call it an estimate, and say how many
run groups had none.

## Empty task assets

A valid task asset can have zero-byte terminal output and no output files;
`nx:noop` commonly does. Check the matching workspace task before reporting a
log-capture or archive defect.

## Report

State the operations queried, filters, item counts, and whether the data is
complete. State whether a result is recorded API data, a local target query, or
a hypothesis. Never claim that an API-only read proved configuration provenance
or tool-native cache state.
