# Log and report assets

Read this file before you inspect an Nx Cloud task log, sandbox report, or other
report asset.

These assets are compressed binary payloads. Treat each as an archive, not
terminal text. Save the exact row-provided link with `--out`. Identify its format
from bytes, not its URL or file name. Decode it with a matching local tool into a
second private file. Do not stream, print, or expand it in the workspace.

Read only lines that answer the investigation. Quote a redacted error signature,
not the complete log or report. Delete both files unless the user requests
retention.

A downloaded asset proves only that it resolves now. A 404 does not prove that it
never existed. Treat user-provided decoded content as provided evidence, not as a
successful API read.
