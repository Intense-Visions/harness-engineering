---
schemaVersion: 1
module: 'packages/core/src/locks'
sourceHash: '9cf2c7c3f1fd4ccfcc1a642e634cfef6d3ff4b43b95f2edb588d0899963db043'
compiledAt: '2026-08-28T01:22:10.431Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['compound-lock.test.ts', 'compound-lock.ts', 'index.ts']
---

## Summary

Per-category file-based locking for `/harness:compound` skill—prevents concurrent work on the same solution category while allowing different categories to run in parallel. Uses `fs.openSync(..., 'wx')` for atomic exclusive-create at `.harness/locks/compound-<category>.lock` containing holder PID. Registers process exit handlers (once for most signals, explicit removal after manual release) to clean up on normal or abrupt termination. Stale locks from SIGKILL require manual recovery. Main API: `acquireCompoundLock(category, opts)` throws `CompoundLockHeldError` on conflict, returns handle with `release()` method.

## Invariants

- Mutual exclusion per category: only one process holds a lock for a given category at any moment; concurrent acquires for the same category serialize via EEXIST.
- Automatic cleanup on clean exit: process exit, SIGINT, SIGTERM, and uncaught exceptions trigger release() via registered handlers; stale locks (SIGKILL, power loss) require manual rm.
- Category validation: category names are validated against ALL_SOLUTION_CATEGORIES at acquire time; unknown categories throw immediately.
- Idempotent release(): calling release() multiple times is safe; subsequent calls are no-ops and detach all listeners even if lock file is already gone.
- Listener hygiene: handlers use process.once for signals (auto-remove on fire) with explicit removal after manual release() to avoid accumulation in long-lived processes with many acquire/release cycles.
- Signal re-raising: SIGINT/SIGTERM handlers re-raise the signal with default disposition after cleanup, ensuring process actually terminates rather than suppressing the signal.
- Cross-category concurrency: different categories have independent lock files and do not contend; concurrent locks on different categories are permitted.

## Interface Contract

```ts
export AcquireOptions
export CompoundLockHandle
export CompoundLockHeldError
export acquireCompoundLock
```

## Dependency Slice

```
import { ALL_SOLUTION_CATEGORIES } from '../solutions/schema'
import { CompoundLockHeldError, acquireCompoundLock } from './compound-lock'
import { SolutionCategory } from '@harness-engineering/types'
import from 'node:child_process'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
