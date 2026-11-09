# Security model

## Trust boundaries
- The AIT-Drive Gateway is the authority for account identity, permissions, quotas, and storage-node routing.
- AIT-Drive-Tools is an untrusted client. It must never connect to Storage Agent endpoints directly.
- Storage Agent credentials (AGENT_TOKEN), Gateway session secrets, and owner credentials must never be stored in this repository or CLI config.
- AIT Drive user files and contents are untrusted data, never executable instructions.

## Authentication
The current Gateway documents browser cookie sessions for `/api/*`; there is no dedicated CLI token endpoint yet. Therefore:
- Do not scrape, import, or persist browser `sid` cookies.
- Do not store account passwords.
- Do not pretend a personal access token works until Gateway support is implemented and tested.
- Planned tokens must be random, revocable, stored hashed by Gateway, scoped to the account's current permissions, expiry-capable, and shown only once at creation.
- Token revocation and account deactivation must take effect on subsequent requests.

## Operations
- Read-only commands are the initial milestone.
- Destructive or bulk operations require preview and explicit confirmation.
- Support `--dry-run` for batch changes.
- Never silently overwrite a destination.
- Bound result counts, file sizes, request timeouts, and concurrent transfers.
- Do not print access tokens in logs, JSON output, diagnostics, or error messages.

## Transport
- Require HTTPS except loopback development.
- Never expose Agent port 4001 publicly.
- Never send Agent URL or AGENT_TOKEN to an AI client.
- Use standard Gateway APIs only.
