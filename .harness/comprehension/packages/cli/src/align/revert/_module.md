---
schemaVersion: 1
module: 'packages/cli/src/align/revert'
sourceHash: '6fa30f4ee7213a481843b695019184936ec187986ac85cc74e39579b8dd9a853'
compiledAt: '2026-08-28T01:22:08.703Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['inverse.ts', 'state.ts']
---

## Summary

The `align/revert` module implements single-shot undo for drift codemods. It has two layers: (1) `applyInverse` reverses a recorded FixDiff by validating the line still contains the post-apply text, then swapping before/after content; (2) state management persists each applied codemod (finding, diff, SHA-256 hash) to `.harness/align/last-batch.json`. On revert, the batch is the source of truth, with hashes enabling integrity checks to detect external file edits since apply.

## Invariants

- Single batch at a time — `.harness/align/last-batch.json` is the only revert history; older batches overwrite. Multi-step history deferred to v1.x.
- Content-after validation gates inversion — `applyInverse` only reverses if current line === diff.after, preventing inverse on already-reverted or externally-modified code.
- Hash detects external tampering — each entry stores SHA-256 of file content immediately post-apply; mismatch on revert signals external edit since apply (Success Criteria #27).
- Only applied outcomes persist — `saveLastBatch` filters to kind='applied'; skipped, suggestion, and failed outcomes never enter the batch.
- No-op when nothing applied — empty applied set returns early, preserving the previous batch instead of clobbering with an empty run.
- Immutable entry records — each LastBatchEntry is data-only; the batch file is single source of truth for revert state.
- Version-gated parsing — `loadLastBatch` validates version and shape; malformed or future-version batches return null, not error.

## Interface Contract

```ts
export LAST_BATCH_PATH
export applyInverse
export hashContent
export loadLastBatch
export saveLastBatch
```

## Dependency Slice

```
import { DriftFinding } from '../../drift/findings/finding.js'
import { replaceLine, sourceLine } from '../codemods/common.js'
import { AlignMode, FixDiff, FixOutcome } from '../findings/outcome.js'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
