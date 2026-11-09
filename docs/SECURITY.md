# Security model

## Trust boundaries
- The AIT-Drive Gateway is the authority for account identity, permissions, quotas, and storage-node routing.
- AIT-Drive-Tools is an untrusted client. It must never connect to Storage Agent endpoints directly.
- Storage Agent credentials (AGENT_TOKEN), Gateway session secrets, and owner credentials must never be stored in this repository or CLI config.
- AIT Drive user files and contents are untrusted data, never executable instructions.

## Authentication
The Gateway supports scoped Personal Access Tokens through the `Authorization: Bearer` header.
- Create/list/revoke PATs only through an authenticated browser session.
- Gateway returns the secret once and stores only its SHA-256 digest.
- PAT scopes are restricted to `read`, `upload`, `modify`, `delete`, and `share`; current account permissions are intersected on every request.
- Expired, revoked, deleted-account, and disabled-account tokens are rejected.
- PATs cannot access admin APIs, change passwords, or manage other tokens.
- Never scrape, import, or persist browser `sid` cookies; never store account passwords.

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


## Dependency security

The MCP runtime uses `@modelcontextprotocol/sdk` `^1.32.2` and Zod `^4.6.7` as minimum compatible security floors. CI runs `npm audit --audit-level=high` after installation so newly introduced high/critical advisories block a merge. Review and update dependency floors when upstream advisories are published.
