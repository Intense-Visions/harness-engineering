---
schemaVersion: 1
module: 'packages/cli'
sourceHash: '5a2da318841933006d2032c7b216faab5f35c8dfa8d203a3f7b69c84db137384'
compiledAt: '2026-08-28T01:22:08.626Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['tsup.config.ts']
---

## Summary

packages/cli is the workspace's main command-line tool, built as a self-contained ESM bundle via tsup. It exposes three entry points (harness, harness-mcp, and a library export) and bundles the four core workspace packages (@harness-engineering/{core,graph,linter-gen,types}) so the CLI works when globally installed without requiring sibling packages. Heavy runtime dependencies—TypeScript (which uses dynamic require('fs')), MCP SDK, and web-tree-sitter—are kept external to avoid bundling breakage.

## Invariants

- Bundled workspace packages must resolve to .mjs/.js dist outputs, never source files; esbuildOptions.alias overrides resolve paths to post-build outputs to exclude devDependencies
- TypeScript, @modelcontextprotocol/sdk, and web-tree-sitter must remain external; TypeScript's dynamic require('fs') breaks under bundling, and MCP SDK + web-tree-sitter are consumer-provided
- All four workspace packages (@harness-engineering/{core,graph,linter-gen,types}) must be in noExternal so they ship with the CLI and the tool works globally without pnpm or workspace sibling installs
- All three entry points (src/index.ts, src/bin/harness.ts, src/bin/harness-mcp.ts) must build cleanly; if any fails to resolve, the entire CLI dist is broken
- dist/ is canonical post-build; source changes don't take effect until turbo build; local testing must run via node packages/cli/dist/bin/harness.js, not the installed harness command

## Interface Contract

```ts
export default
```

## Dependency Slice

```
import path from 'path'
import { defineConfig } from 'tsup'
```
