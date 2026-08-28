---
schemaVersion: 1
module: 'packages/cli/src/knowledge-craft/extract'
sourceHash: 'd95a7a75870027fcbf1d3c94cccc2bc488e77faa36b325646f07997d1d0e5048'
compiledAt: '2026-08-28T01:22:09.229Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['discover.ts']
---

## Summary

The `knowledge-craft/extract` module discovers markdown knowledge entries by recursively walking `docs/knowledge/`, excluding ADRs (in `decisions/`) and README files. It returns absolute and relative file paths for all markdown content. The design intentionally segregates knowledge from spec-craft's ADR territory to prevent double-critique. The discovery is stateless, fault-tolerant (missing root returns `[]`), and cross-platform aware (normalizes paths to forward slashes).

## Invariants

- decisions/ is always excluded — ADRs belong to spec-craft; knowledge-craft never touches them
- README.md files are always skipped — case-insensitive match handles .MD variants
- Only .md files are collected — case-insensitive extension matching aligns with README exclusion
- Relative paths use forward slashes — cross-platform normalization via replaceAll('\\', '/') ensures consistent keys across Windows/Unix
- Dotfiles and dot-directories are silently skipped — prevents .git/, .hidden/ pollution
- Missing docs/knowledge/ root returns [] gracefully — no throw; callers must handle empty result
- Extra exclude directories are composable — caller can pass extraExcludeDirs to exclude project-specific folders; merged into primary exclusion set

## Interface Contract

```ts
export DEFAULT_EXCLUDED_DIRS
export KNOWLEDGE_ROOT
export discoverKnowledgeEntries
```

## Dependency Slice

```
import * as fs from 'node:fs'
import * as path from 'node:path'
```
