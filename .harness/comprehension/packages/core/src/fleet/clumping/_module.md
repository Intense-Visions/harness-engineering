---
schemaVersion: 1
module: 'packages/core/src/fleet/clumping'
sourceHash: '9fc3355eb20ca3e8ed9017a1e32501e180a57bdef5d846b512d5fb9eba676ebd'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['floor.test.ts', 'floor.ts', 'form.test.ts', 'form.ts', 'laws.test.ts', 'types.ts']
---

## Interface Contract

```ts
export DEFAULT_CLUMP_POLICY
export formClumps
export resolveClumpPolicy
export resolveFloor
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../craft/axes'
import { DEFAULT_CLUMP_POLICY, resolveClumpPolicy, resolveFloor } from './floor'
import { formClumps } from './form'
import { Clump, ClumpCounts, ClumpPolicy, ClumpResult, ClumpableItem, FloorContext, FloorVerdict, FlooredItem, Grade } from './types'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
```
