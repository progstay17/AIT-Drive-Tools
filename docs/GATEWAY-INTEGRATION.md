# Gateway integration contract

The current Gateway API reference is maintained in [AIT-Drive](https://github.com/progstay17/AIT-Drive/blob/main/docs/API.md).

## Existing endpoints used by the first client layer
- `GET /api/list?path=`
- `GET /api/search?q=`
- `GET /api/stats`
- `POST /api/share` with `{ path, days }`

All currently require a valid browser `sid` cookie. The client code intentionally refuses to make requests without `AIT_DRIVE_TOKEN`, but the Gateway does not yet accept Bearer tokens. This is an explicit integration blocker, not a configuration mistake.

## Required Gateway change (separate PR in AIT-Drive)
Introduce a personal access token subsystem without changing existing browser sessions:
- Create/revoke/list tokens through authenticated account endpoints.
- Store only a cryptographic hash of each token in the persistent account database.
- Token prefix/identifier may be stored for display; secret is returned only once.
- Include account ID, token ID, scopes, created-at, optional expiry and last-used.
- Bearer middleware resolves the token to the account and then calls the same `resolveCtx` / permission enforcement path as cookie sessions.
- Re-check account active state and current permissions on every request.
- Owner/admin tokens must have explicit policy; no privilege escalation by caller-provided scopes.
- Existing cookie auth and CSRF behavior remain unchanged.
- Add tests for invalid, expired, revoked, disabled-account, permission-change, and scope-denial cases.

Do not add PAT support by weakening CSRF checks for browser sessions. Bearer-token requests are a separate authentication mechanism with their own authorization checks.
