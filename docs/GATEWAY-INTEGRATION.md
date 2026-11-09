# Gateway integration contract

The Gateway API reference is maintained in [AIT-Drive](https://github.com/progstay17/AIT-Drive/blob/main/docs/API.md).

## Authentication

The Gateway now accepts scoped Personal Access Tokens (PATs) on supported `/api/*` endpoints:

```http
Authorization: Bearer aitd_<id>.<secret>
```

Create, list, and revoke tokens from an authenticated browser session:
- `GET /api/tokens`
- `POST /api/tokens` with `{ "label": "Desktop CLI", "scopes": ["read", "upload", "modify"], "expiresInDays": 365 }`
- `DELETE /api/tokens/:id`

The create response contains the token secret exactly once. Gateway stores only its SHA-256 digest. Supported scopes are `read`, `upload`, `modify`, `delete`, and `share`; `read` is always included. Requested write scopes must be permitted by the account. Current account permissions and active status are rechecked on every request. PATs cannot manage tokens, change passwords, or access admin endpoints.

Set the token in the local environment or secret manager:

```powershell
$env:AIT_DRIVE_URL = "https://your-drive.example"
$env:AIT_DRIVE_TOKEN = "aitd_<id>.<secret>"
ait-drive config --json
ait-drive account --json
ait-drive files list --path "" --json
```

Never commit the token to Git, paste it into prompts, or print it in diagnostics. Do not scrape or persist browser `sid` cookies and do not store account passwords.

## Client contract

The CLI and MCP use the same `GatewayClient` service layer:
- `GET /api/list?path=`
- `GET /api/search?q=`
- `GET /api/stats`
- `GET /api/me`
- `POST /api/share` with `{ path, days }`

The Gateway remains the sole authority for account identity, permissions, quotas, and storage-node routing. Tools never connect to Agent endpoints or storage roots directly.

## Security and deployment boundaries

- Bearer authentication is separate from browser-cookie sessions; browser CSRF protections remain unchanged.
- An invalid Authorization header never falls back to a valid browser cookie.
- Require HTTPS except loopback development.
- Never expose Agent port 4001 or send Agent URL/AGENT_TOKEN to an AI client.
- No CLI/MCP operation deploys to Coolify or modifies Gateway/Agent environment variables.
