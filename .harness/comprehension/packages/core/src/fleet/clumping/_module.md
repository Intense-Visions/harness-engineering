---
schemaVersion: 1
module: 'packages/core/src/fleet/clumping'
sourceHash: '543e0e8aaa1f2eade31aa28709233a39e393a8e9735bff9dbe4e1e5c47192bd9'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['floor.test.ts', 'floor.ts', 'form.test.ts', 'form.ts', 'index.ts', 'laws.test.ts', 'types.ts']
---

## Interface Contract

```ts
export Clump
export ClumpCounts
export ClumpPolicy
export ClumpResult
export ClumpableItem
export DEFAULT_CLUMP_POLICY
export FloorContext
export FloorVerdict
export FlooredItem
export Grade
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
