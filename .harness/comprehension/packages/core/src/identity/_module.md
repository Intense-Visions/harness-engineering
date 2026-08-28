---
schemaVersion: 1
module: 'packages/core/src/identity'
sourceHash: '2069293fb48fe25f4f60daa9c592d4b1322b697040ed505e15472b0fe05c67f4'
compiledAt: '2026-08-28T01:22:10.412Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'store.ts', 'ulid.ts']
---

## Summary

The `identity` module provides three coordinated capabilities: (1) ULID generation—collision-free, lexicographically sortable 26-character identifiers with monotonic ordering within a millisecond; (2) file-backed identity store—a create-if-absent pattern for HarnessIdentity records where the ULID is immutable once written; (3) monotonic completion counter—a read-increment-write allocator that assigns sequential numbers to identities, with idempotent behavior to prevent re-incrementing. Consumed by session and worktree wiring; best-effort on IO failures (identity is metadata, never a gate). Exports direct ULID utilities (`generateUlid`, `isValidUlid`, `ulidTime`) and higher-level management (`readIdentity`, `ensureIdentity`, `assignNumber`, `nextNumber`); re-exports `readIdentity` as `readHarnessIdentity` to avoid collision with telemetry's same-named export.

## Invariants

- ULID immutability: Once a record is persisted with a ULID, that ULID never changes—subsequent reads return the identical ULID even if called with different slug/domain options.
- Creation-if-absent atomicity: ensureIdentity writes the ULID exactly once; a second call returns the existing record without overwriting, regardless of options passed.
- Completion-number idempotence: assignNumber will not re-increment the counter if the identity already has a number assigned—safe to call multiple times.
- Counter initialization: Counter starts at 0 if the file doesn't exist; nextNumber increments before returning, so the first allocation yields 1.
- Timestamp fidelity: ULID timestamps are deterministic and immutable; ulidTime always extracts the same value from a given ULID.
- Monotonic ordering within a millisecond: Two ULIDs with the same timestamp are ordered via strict random-component increments, not re-randomization—no collisions.
- Best-effort IO contract: Write failures never gate the operation. Read errors return null; write errors return the in-memory record (identity is metadata, not a critical path).
- ULID validation strictness: Only 26-character strings using Crockford base32 (0-9, A-Z excluding I/L/O/U) are considered valid; isValidUlid enforces this strictly.

## Interface Contract

```ts
export assignNumber
export ensureIdentity
export generateUlid
export isValidUlid
export nextNumber
export readHarnessIdentity
export readIdentity
export ulidTime
```

## Dependency Slice

```
import { generateUlid } from './ulid'
import { HarnessIdentity, IdentityDomain } from '@harness-engineering/types'
import * as fs from 'fs'
import * as path from 'path'
```
