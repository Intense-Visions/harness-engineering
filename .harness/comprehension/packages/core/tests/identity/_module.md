---
schemaVersion: 1
module: 'packages/core/tests/identity'
sourceHash: '9f3ea6c67e960519caae059c7f8eabda049e074f063eb5276316ace3580fca7f'
compiledAt: '2026-08-28T01:22:10.872Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['barrel.test.ts', 'store.test.ts', 'ulid.test.ts']
---

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
