---
schemaVersion: 1
module: 'packages/core/src/golden'
sourceHash: '3892c08dc8ce0f3a4e63e9c10907c8fbd4788f3b35da292f3a6d4af9953dba79'
compiledAt: '2026-08-28T01:22:10.399Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'manager.ts', 'types.ts']
---

## Summary

The `golden` module manages an immutable reference-state snapshot of a project—a composite fingerprint of SHA-256 hashes for configured reference files (arch/coverage/benchmark baselines, harness config, package.json, lockfile). It sits above metric baselines to answer "is the repo still the exact known-good shape we last promoted?" The GoldenBuildManager captures the current working-tree state, promotes it as a canonical reference, and diffs the tree against the last golden state, reporting changed/missing/added files. It persists snapshots to `.harness/golden/manifest.json` with atomic writes and is designed so re-promoting an unchanged state produces a byte-identical file (preventing spurious diffs and merge conflicts).

## Invariants

- Byte-stable manifests on no-op promotes—if the fingerprint is unchanged, the on-disk file is byte-identical to before, preventing spurious diffs and merge conflicts from re-promoting an unchanged state
- Provenance is informational only—promotedAt, commit, and branch are never compared; only the files array matters for clean/dirty state
- Reference file array is sorted by path—the fingerprint is a deterministic function of the set of files, not collection order
- Fingerprint comparison is order-insensitive—uses a path→hash map, not array equality
- Absent reference paths are omitted, not errors—if a configured path doesn't exist at capture time, it is simply skipped (allows adopter projects with subsets)
- Atomic file writes via temp + rename—guarantees corrupt-safe disk persistence
- Clean state is exact match—working tree is clean iff current fingerprint equals golden fingerprint exactly (zero changed, missing, or added files)

## Interface Contract

```ts
export DEFAULT_GOLDEN_MANIFEST_PATH
export DEFAULT_GOLDEN_REFERENCE_PATHS
export GoldenBuildManager
export GoldenConfig
export GoldenConfigSchema
export GoldenDiffResult
export GoldenDiffResultSchema
export GoldenFileChange
export GoldenFileChangeSchema
export GoldenFileEntry
export GoldenFileEntrySchema
export GoldenProvenance
export GoldenSnapshot
export GoldenSnapshotSchema
```

## Dependency Slice

```
import { DEFAULT_GOLDEN_MANIFEST_PATH, DEFAULT_GOLDEN_REFERENCE_PATHS, GoldenDiffResult, GoldenFileChange, GoldenFileEntry, GoldenSnapshot, GoldenSnapshotSchema } from './types'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
```
