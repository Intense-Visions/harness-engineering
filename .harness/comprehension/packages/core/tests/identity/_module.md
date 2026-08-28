---
schemaVersion: 1
module: 'packages/core/tests/identity'
sourceHash: '9f3ea6c67e960519caae059c7f8eabda049e074f063eb5276316ace3580fca7f'
compiledAt: '2026-08-28T01:22:10.872Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['barrel.test.ts', 'store.test.ts', 'ulid.test.ts']
---

## Summary

The identity module provides stable, sortable identifiers for harness sessions and entities via ULIDs + monotonic numbering. ULID generation produces 26-char Crockford base32 strings with embedded millisecond-precision timestamps, ensuring lexicographic ordering matches creation order. Identity persistence writes immutable JSON files on first call (slug/domain locked in); subsequent calls with different parameters are ignored. Monotonic numbering allocates sequential integers (1, 2, 3…) across identity files via a shared counter file, with idempotent re-assignment. The module re-exports all three capabilities (generateUlid, isValidUlid, ensureIdentity) through the core barrel, ensuring consumers can rely on a single import path.

## Invariants

- ULID monotonicity within millisecond: Two ULIDs seeded with the same timestamp must sort in creation order (a < b iff generated first).
- ULID timestamp round-trip: ulidTime(generateUlid(t)) always recovers the original timestamp t.
- Identity immutability: Once ensureIdentity(file, {slug, domain}) succeeds, re-calling with a different slug must preserve the original slug and ULID; the file is never overwritten.
- Monotonic counter never resets: nextNumber(counterFile) produces strictly increasing integers; no gaps, no repeats.
- Assigned numbers are idempotent: assignNumber(id, counter) returns the same number on re-call for the same identity file; the global counter is not re-incremented.
- Null safety on missing identity: assignNumber(file, counter) returns null if the identity file does not exist; never creates one implicitly.
- Graceful read failure: readIdentity(file) returns null for missing or malformed JSON; never throws.
- ULID format validation is strict: isValidUlid() rejects strings not matching 26-char Crockford base32 (excludes I, l, uppercase variants, and non-alphanumeric).

## Interface Contract

```ts

```

## Dependency Slice

```
import { assignNumber, ensureIdentity, nextNumber, readIdentity } from '../../src/identity/store'
import { generateUlid, isValidUlid, ulidTime } from '../../src/identity/ulid'
import { HarnessIdentity, ensureIdentity, generateUlid, isValidUlid } from '../../src/index'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
