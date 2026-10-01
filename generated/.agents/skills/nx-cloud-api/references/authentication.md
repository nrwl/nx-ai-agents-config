# Authentication and failure recovery

Read this file only for a live-read credential problem or custom authentication.

## Credential selection

The client selects the server in this order:

1. An absolute `request` or `describe` URL origin.
2. `--cloud-url`.
3. `NX_CLOUD_URL`.
4. `nxCloudUrl` in the nearest `nx.json`.
5. `https://cloud.nx.app`.

It selects one credential set in this order:

1. `--token-file`, `NX_CLOUD_ACCESS_TOKEN`, or `NX_CLOUD_AUTH_TOKEN` for bearer access.
2. `NX_CLOUD_ID`, then `nxCloudId` in `nx.json`.
3. `NX_CLOUD_PERSONAL_ACCESS_TOKEN`, then the matching URL section in
   `~/.config/nxcloud/nxcloud.ini`.

Use `--config <file>` for a different INI file. A token file must contain one
token and have owner-only POSIX permissions. Never put a token in a command,
variable, log, or chat message.

The client sends a bearer token as `Authorization: Bearer <token>`. Otherwise it
sends the paired `Nx-Cloud-Personal-Access-Token` and `Nx-Cloud-Id` headers.
A selected token does not prove that it is valid. Only a live request can do so.

## PAT flow

Run `nx login --status` from the workspace root before a PAT query. If it finds
no usable PAT, run `nx login` there. Do not substitute another login command.

## Recovery

| Result                | Safe next action                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| No Nx Cloud ID or URL | Run from the workspace root. Confirm `nxCloudId` and `nxCloudUrl`, or use explicit safe overrides.                                            |
| No PAT                | Run `nx login --status`, then `nx login` if needed. Never request the token value.                                                            |
| HTTP 401              | Recheck the selected credential. For PAT, repeat the PAT flow. For a workspace token, confirm its workspace and validity without printing it. |
| HTTP 403              | Confirm the workspace. Ask its administrator for access.                                                                                      |
| HTTP 404              | Run `catalog` and `describe`. Then verify the resource ID.                                                                                    |
| HTTP 409              | Read the operation description. Wait for the named parent or workflow to finish. Retry the same bounded request.                              |
| HTTP 429              | Wait, reduce `--pages`, and narrow filters.                                                                                                   |
| HTTP 5xx              | Retry after a short wait. Keep endpoint, time range, and status for support.                                                                  |
| Network error         | Check the selected URL, proxy, VPN, and network. Use `--dry-run` after a request change.                                                      |

Do not bypass an access failure with another person's token. Do not alter a
workspace configuration without the user's explicit request.
