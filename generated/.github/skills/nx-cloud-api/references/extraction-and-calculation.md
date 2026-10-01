# Large extraction, assets, and calculations

Read this file only for more than one page, a saved response, a binary asset, or
a calculation.

## Extraction

1. Run `describe`. Use only its documented filters and cursor fields.
2. Request one filtered page. Use its count to choose a small `--pages` value.
3. Split periods only with documented, non-overlapping time boundaries.
4. Run ranges in sequence. Save each response and metadata separately.
5. Combine data only when every metadata file has `pageLimitReached: false`.

When no time boundary exists, use the documented cursor in bounded batches. Keep
the same filters. Save each `nextCursor`. A failed range makes the extraction
incomplete; do not calculate a complete result from other ranges.

Use owner-only output files:

```sh
node <skill_dir>/scripts/nx-cloud-api.mjs request task-stats \
  --workspace . \
  --query dateAfter=2026-08-01 \
  --query dateBefore=2026-08-07 \
  --query percentiles=50 \
  --query percentiles=95 \
  --pages 3 \
  --format ndjson \
  --out /tmp/nx-cloud-task-stats.ndjson \
  --metadata-out /tmp/nx-cloud-task-stats.metadata.json
```

Keep the metadata with its data. Record each time range, filters, files, and
completion state in a manifest.

## Assets

Use `--out <file>` for an asset. The client follows documented redirects. Do not
print binary data. A returned asset link proves only that a route was advertised.
A successful download proves only that it resolves now. A 404 does not prove that
the asset never existed.

Nx Cloud log and report assets are compressed binary payloads. Treat each as an
archive, not terminal text. Save it privately. Identify its format from bytes, not
the URL or file name. Decode it with a matching local tool into a second private
file. Do not stream, print, or expand it in the workspace.

Read only the needed lines from the decoded text. Quote a redacted error signature,
not the complete log or report.

A non-empty gzip payload can contain a valid tar archive whose terminal-output
entry is zero bytes. The artifact can also contain an empty outputs directory and
a zero-byte `terminalOutput` beside a successful exit code. This is usually not a
problem when the task writes no stdout or stderr and produces no declared output
files. An `nx:noop` target is one common example.

Do not classify this shape as archive corruption or a log-capture defect from the
asset alone. Inspect the matching workspace task first. Check its resolved
executor, command, declared outputs, and expected terminal behavior. A matching
hash associates the archive with the task, but it does not prove that output
should exist.

## Calculation

Save the bounded input. Use a script that:

1. Reads the saved JSON or NDJSON.
2. States fields, filters, time range, and formula in a code comment.
3. Prints machine-readable JSON before prose.
4. Uses numeric timestamps and weighted counts for rates.
5. Deletes raw data unless the user requests retention.

Do not calculate material rates, percentiles, or durations by inspection.
