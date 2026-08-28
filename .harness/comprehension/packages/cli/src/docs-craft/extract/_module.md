---
schemaVersion: 1
module: 'packages/cli/src/docs-craft/extract'
sourceHash: '39da5bcb3e5a7146f77bda8c8084b834450336dd6bb30b31f99cf5ff0f721e12'
compiledAt: '2026-08-28T01:22:09.145Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['discover.ts']
---

## Summary

This module discovers and classifies markdown documentation files in a project, walking the `docs/` tree and root `README.md` while excluding directories owned by sibling skills (knowledge-craft, spec-craft) and generated artifacts (roadmap shards, plans, solutions). Classification is heuristic-based (readme/reference/guide/prose by path patterns) to filter rubrics efficiently; the LLM does fine-grained judgment later. It is a structural twin of design-craft's component discovery.

## Invariants

- Curated exclusion list is authoritative — sibling skills own specific directories; docs-craft must not critique them, else blame lands on wrong skill
- Heuristic classification is intentionally cheap (regex patterns only) to avoid parsing/LLM cost at discovery time; real judgment happens during LLM critique
- Root README must be explicitly included via separate fs.existsSync check — it lives outside the docs/ tree and would be missed by walk() alone
- Relative paths use POSIX separators via replaceAll('\\', '/') for consistent cross-platform display and prompt matching
- Deduplication via seen Set prevents root README from being reported twice if symlinked or copied into docs/
- Only .md files are included; non-markdown docs are out of scope
- Dot-files and dot-directories are skipped by walk() — convention-based hidden surfaces have no teaching value

## Interface Contract

```ts
export DEFAULT_EXCLUDED_DIRS
export DOCS_ROOT
export classifyDoc
export discoverDocs
```

## Dependency Slice

```
import { DocKind } from '../catalog/rubrics/types.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
