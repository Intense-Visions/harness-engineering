---
schemaVersion: 1
module: 'packages/cli/tests/align/revert'
sourceHash: '388d5769841ffe78e61c5baad8fb6775de01ded7868ae9f2fee6fedfbfef15ea'
compiledAt: '2026-08-28T01:22:09.526Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['inverse.test.ts', 'state.test.ts']
---

## Summary

The `packages/cli/tests/align/revert` module tests the drift-fixing revert subsystem, which safely reverses previously applied design-token alignment fixes. It has two parts: **applyInverse** reverses a single line-level code change by validating that the current source matches the recorded "after" state, then replacing it with the original "before" content, returning either a mutated source + inverted diff or a rejection explaining why the line no longer matches. **Batch state management** persists a single-shot history of applied fixes with post-application file hashes, enabling integrity checks before reversion; the save path deduplicates file reads and silently drops non-applied outcomes, while the load path gracefully handles missing/corrupted/versioned batch files by returning null.

## Invariants

- Line-level matching is strict — applyInverse refuses to revert if current line content doesn't match the recorded 'after' value exactly, preventing silent corruption
- Source immutability — input source string must never be mutated; only return values change state
- Single-shot batch history — saveLastBatch overwrites the prior batch file completely; system can only revert the most recent applied batch
- Content hashing prevents stale reversions — each entry includes postApplySha256 hash to verify file hasn't drifted since fix was applied
- Deduplication within a batch — multiple entries touching the same file share one hash computation and one postApplySha256 value, assuming atomic application
- Only applied outcomes persist — suggestions, skipped, and failed outcomes are silently dropped; only kind: 'applied' outcomes write to disk
- Versioned batch schema — loader checks version === 1 and rejects unsupported versions, preventing silent parse failures on schema changes
- Graceful degradation on missing/corrupt state — missing, malformed, or unsupported batch files return null instead of throwing
- Absolute file paths — paths in diff records are absolute; relative paths during load-time resolution could cause collisions or escapes

## Interface Contract

```ts

```

## Dependency Slice

```
import { FixOutcome } from '../../../src/align/findings/outcome'
import { applyInverse } from '../../../src/align/revert/inverse'
import { LAST_BATCH_PATH, hashContent, loadLastBatch, saveLastBatch } from '../../../src/align/revert/state'
import { DriftFinding } from '../../../src/drift/findings/finding'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
