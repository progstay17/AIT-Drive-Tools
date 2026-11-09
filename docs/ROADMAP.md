# Roadmap

## Phase 0 — repository foundation
- [x] Separate repository created.
- [x] Define Gateway-first architecture and security boundary.
- [x] CI, typecheck, tests.

## Phase 1 — read-only CLI + MCP
- [x] Gateway-issued revocable personal access tokens.
- [x] Authenticated identity / permission introspection.
- [x] List, search, storage stats.
- [ ] CLI and MCP parity tests.

## Phase 2 — safe file operations
- [x] Upload/download with streaming (progress reporting remains open).
- [x] Create folder, rename, move, trash, restore.
- [x] Preview/dry-run and explicit confirmation for rename, move, delete, and batch share.
- [x] CLI byte-progress reporting for uploads and downloads (persistent transfer history remains open).

## Phase 3 — high-level workflows
- [x] Batch share with per-item results.
- [ ] Organize files from natural-language plans.
- [x] Export search results to CSV (XLSX and selected-item export remain open).
- [ ] Verify every operation and return a machine-readable report.

## Phase 4 — integrations
- [ ] AI skill package and installation guide.
- [ ] MCP transport for supported remote clients.
- [ ] Windows-friendly installer and shell completion.
- [ ] Compatibility matrix for ChatGPT, Codex, Claude, and other clients.

No phase automatically deploys to Coolify or modifies a Storage Agent.
