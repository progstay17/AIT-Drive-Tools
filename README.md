# AIT Drive Tools

Universal AI interface for AIT Drive: a cross-platform CLI, MCP server, and reusable AI skill.

This repository is intentionally separate from:
- [AIT-Drive](https://github.com/progstay17/AIT-Drive): Gateway, web UI, authentication, permissions, and storage routing.
- [AIT-Drive-Agent](https://github.com/progstay17/AIT-Drive-Agent): Windows storage service and filesystem operations.

## Design principles

1. The Gateway remains the authority for identity, permissions, quotas, and storage-node routing.
2. Tools communicate with the Gateway over HTTPS. They never access storage roots or Agent ports directly.
3. CLI and MCP share one application/service layer so behavior and safeguards stay consistent.
4. JSON output is stable and intended for AI agents; human-readable output remains available.
5. Destructive and bulk operations support preview/dry-run and explicit confirmation.
6. No production deployment, environment changes, or Agent changes are part of this repository's development workflow.

## Planned capabilities

- CLI: account context, file/folder search and management, streaming single-file/folder transfers, trash, sharing, storage status, and CSV export.
- Batch workflows: batch move/share with per-item results, safe previews, recursive folder upload, folder creation, and search-result CSV export.
- MCP: discoverable tools with typed input schemas and structured results.
- AI skill: instructions and examples that let compatible agents learn the CLI without bespoke prompting.
- OpenAPI contract and integration tests.

## Current API compatibility

AIT-Drive Gateway now supports scoped, revocable Personal Access Tokens (PATs) for CLI and MCP clients. Create a token from an authenticated browser session, then set `AIT_DRIVE_URL` and `AIT_DRIVE_TOKEN` locally. The token secret is shown once; Gateway stores only its SHA-256 digest. Browser-cookie scraping and password storage are intentionally unsupported.

See [docs/ROADMAP.md](docs/ROADMAP.md), [docs/SECURITY.md](docs/SECURITY.md), and [docs/GATEWAY-INTEGRATION.md](docs/GATEWAY-INTEGRATION.md).

## Multiple accounts / profiles

On Windows, CLI profiles keep Gateway URLs and PATs separate. PAT secrets are protected with the current Windows user's DPAPI; the secret is never written as plaintext. Login validates the PAT against `/api/me` before saving it.

```powershell
ait-drive auth login --profile kantor
ait-drive auth login --profile pribadi
ait-drive auth list
ait-drive auth switch kantor
ait-drive auth status
ait-drive auth logout --profile kantor
```

During login, enter the Gateway URL and PAT when prompted. PAT input is hidden. The active profile is used by both CLI and MCP. To select a profile for a dedicated MCP process without changing the global active profile, set `AIT_DRIVE_PROFILE=kantor` in that MCP server's environment. An explicit CLI `--profile <name>` also selects a profile.

`auth logout` removes only the local profile and does not revoke its server token. Use `auth logout --revoke` to ask the Gateway to revoke that profile's own PAT before deleting its local credentials. If an administrator has already revoked the token from the web panel, local logout still works without `--revoke`.

The profile vault currently uses Windows DPAPI. On macOS/Linux, use environment variables supplied by the host's secret manager (`AIT_DRIVE_URL`, `AIT_DRIVE_TOKEN`) instead of persistent local profiles.

## CLI activity and progress feedback

Long-running CLI commands report activity instead of appearing idle:
- Terminal sessions show a spinner, elapsed time, and a clear success/failure result.
- Non-interactive runs write task status to stderr; JSON results remain on stdout.
- Upload/download progress reports transferred bytes, percentage when the total is known, throughput, and estimated time remaining.
- PAT login reports validation and encrypted profile-saving stages separately. PAT characters are never echoed.
- Gateway connection failures and request timeouts include actionable diagnostics.
- Ctrl+C remains available to interrupt interactive commands; interrupted network requests are cancelled by the request timeout/signal handling.

Progress and status are written to stderr so scripts and AI agents can continue parsing stdout as JSON. Use `--json` when a command's result must always be machine-readable.

## Development

Requirements: Node.js 20+.

```powershell
npm install
npm test
npm run typecheck
```

## Status

Scoped Gateway PAT authentication and core file operations are implemented. Persistent transfer history, richer batch organization, and XLSX spreadsheet export are next.
