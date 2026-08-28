---
schemaVersion: 1
module: 'packages/core/scripts'
sourceHash: 'b7337c3d8de19d0ed2b9acbe88b1de062bc9bcc85db1f43a4c4d69bc45e9e2cb'
compiledAt: '2026-08-28T01:22:10.208Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['backfill-learnings-frontmatter.ts']
---

## Summary

**backfill-learnings-frontmatter.ts** is a non-destructive CLI utility that enriches existing learnings.md entries with hash-keyed frontmatter comments. It scans for dated bullets and headings, extracts tags from inline `[skill:...]` and `[outcome:...]` patterns, computes 8-char SHA256 digests, and injects `<!-- hash:XXXX tags:... -->` comments above unprocessed entries. Used to bootstrap learnings catalogs during migrations where frontmatter is added post-hoc. The operation is idempotent and preserves all entry content.

## Invariants

- Hash computation via SHA256 must be deterministic (same input always produces same 8-char digest) for deduplication and change tracking across runs
- Frontmatter detection regex (/^<!--\s+hash:[a-f0-9]+/) must accurately identify already-processed entries to prevent duplicate comment insertion
- Script is non-destructive: all non-matching lines preserved exactly as-is; only frontmatter comments inserted before dated entries
- Tag extraction recognizes only [skill:...] and [outcome:...] patterns; other bracketed labels ignored
- Entry triggers are dated bullets (- \*\*YYYY-MM-DD) and dated headings (## YYYY-MM-DD) only; other formats pass through unchanged
- Idempotent operation: multiple runs on same file produce identical output (already-tagged entries skip re-processing)

## Interface Contract

```ts

```

## Dependency Slice

```
import * as crypto from 'crypto'
import * as fs from 'fs'
```
