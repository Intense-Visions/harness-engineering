---
schemaVersion: 1
module: 'packages/core/src/identity'
sourceHash: '2069293fb48fe25f4f60daa9c592d4b1322b697040ed505e15472b0fe05c67f4'
compiledAt: '2026-08-28T01:22:10.412Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'store.ts', 'ulid.ts']
---

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
