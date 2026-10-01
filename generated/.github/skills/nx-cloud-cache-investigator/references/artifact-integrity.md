# Cache artifact integrity

Read this file only when a run-group or main-job error names artifact download,
validation, decompression, or extraction.

Follow the exact task-row artifact link. Save it privately. Do not extract it in
the workspace.

1. Record byte count and SHA-256.
2. Detect the format from bytes, not the extension.
3. Validate the complete compression stream and member table.
4. Reject trailing bytes, truncation, checksum failure, or an unreadable table.
5. Compare the same artifact from another supplied failure when available.
6. Compare a known-good artifact from the same run before calling an unusual
   encoding malformed.
7. Delete the download unless the user requests retention.

Byte-identical malformed downloads across retries support a persistent bad cache
object. A later valid download does not prove that an earlier object was valid.
The API cannot identify an upload path, writer, storage event, or service mutation.
Recommend invalidation or replacement of the exact object. Preserve the CIPE,
run group, task ID, and hash for support. Do not recommend unchanged retries.
