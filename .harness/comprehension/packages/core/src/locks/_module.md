---
schemaVersion: 1
module: 'packages/core/src/locks'
sourceHash: '9cf2c7c3f1fd4ccfcc1a642e634cfef6d3ff4b43b95f2edb588d0899963db043'
compiledAt: '2026-08-28T01:22:10.431Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['compound-lock.test.ts', 'compound-lock.ts', 'index.ts']
---

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
