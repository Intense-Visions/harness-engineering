---
schemaVersion: 1
module: 'packages/core/tests/golden'
sourceHash: '6911981a205615dee811613ff97db83ba213f8847e8ea113d687b4f2351e7ecf'
compiledAt: '2026-08-28T01:22:10.865Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['manager.test.ts']
---

## Summary

**`packages/core/tests/golden`** tests the `GoldenBuildManager`, which maintains a byte-stable snapshot of reference files (config, baselines, etc.) and detects drifts in the working tree.

The module captures snapshots by hashing a curated list of reference files—storing SHA256 hashes sorted by path—in a manifest (`.harness/golden/manifest.json`). The core contract is:

- **`promote(provenance)`** — captures current file hashes as a snapshot; returns `{ snapshot, changed }` where `changed` indicates whether the fingerprint is new or unchanged
- **`load()`** — retrieves the persisted snapshot, or `null` if none exists
- **`diff(snapshot)`** — compares working tree against a snapshot, detecting `changed`, `missing`, `added` files, and reporting `clean` status

Promotes are **byte-stable**: if file content doesn't change, the manifest rewrites identically (provenance stays on the original commit), avoiding spurious CI noise. If content changes, provenance updates to the new commit.

The diff surface is **composable**: you can promote with one reference-path set and diff with a different (wider/narrower) set, allowing golden snapshots to adapt to evolving file lists without losing fidelity on existing tracked files.

## Invariants

- File ordering — Snapshot files are always sorted lexicographically by path; re-promotion must preserve order for byte stability
- Hash format — SHA256 hashes are canonical 64-character hex strings; schema validation is required (GoldenSnapshotSchema.safeParse())
- Provenance immutability on re-promote — Provenance (commit, branch) is preserved only when fingerprint is unchanged; bumped only when file content changes
- Null-safe load — First call to load() returns null (no golden exists yet); subsequent calls after promote() return the snapshot
- Reference path variance — Diff operates on whatever reference paths are configured at diff time, independent of promote-time paths; this allows detecting added files
- Missing ≠ optional — A file in the golden snapshot that's deleted in the working tree is flagged as missing, not simply omitted
- Manifest isolation — The golden manifest is always written to .harness/golden/manifest.json within the target directory; tests use ephemeral temp dirs
- Hash collision semantics — Two files with identical hash are considered identical content (no false-positive drift detection)

## Interface Contract

```ts

```

## Dependency Slice

```
import { GoldenBuildManager } from '../../src/golden/manager'
import { GoldenSnapshotSchema } from '../../src/golden/types'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
