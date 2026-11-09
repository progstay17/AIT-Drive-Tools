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

- CLI: authentication, account context, file/folder search and management, transfers, trash, sharing, storage status.
- Batch workflows: bulk move, bulk share, folder creation, metadata reports, and data export.
- MCP: discoverable tools with typed input schemas and structured results.
- AI skill: instructions and examples that let compatible agents learn the CLI without bespoke prompting.
- OpenAPI contract and integration tests.

## Current API compatibility

AIT-Drive Gateway now supports scoped, revocable Personal Access Tokens (PATs) for CLI and MCP clients. Create a token from an authenticated browser session, then set `AIT_DRIVE_URL` and `AIT_DRIVE_TOKEN` locally. The token secret is shown once; Gateway stores only its SHA-256 digest. Browser-cookie scraping and password storage are intentionally unsupported.

See [docs/ROADMAP.md](docs/ROADMAP.md), [docs/SECURITY.md](docs/SECURITY.md), and [docs/GATEWAY-INTEGRATION.md](docs/GATEWAY-INTEGRATION.md).

## Development

Requirements: Node.js 20+.

```powershell
npm install
npm test
npm run typecheck
```

## Status

Early development. Scoped Gateway PAT authentication is implemented; additional file and batch workflows are next.
