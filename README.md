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

The current Gateway API uses browser session cookies for `/api/*`; it does not yet expose a dedicated personal access token flow. The Tools CLI must **not** scrape browser cookies or persist account passwords. A narrowly scoped, revocable CLI token capability must be added to AIT-Drive Gateway in a separate reviewed change before authenticated CLI operations are enabled.

See [docs/ROADMAP.md](docs/ROADMAP.md), [docs/SECURITY.md](docs/SECURITY.md), and [docs/GATEWAY-INTEGRATION.md](docs/GATEWAY-INTEGRATION.md).

## Development

Requirements: Node.js 20+.

```powershell
npm install
npm test
npm run typecheck
```

## Status

Early development. No production integration is enabled yet.
