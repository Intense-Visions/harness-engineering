---
schemaVersion: 1
module: 'packages/core/src/fleet/clumping'
sourceHash: '9199b00127eae55b50e29215d537528fab3d5abe96004de9c1330aef4a953130'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['floor.test.ts', 'floor.ts', 'form.test.ts', 'form.ts', 'types.ts']
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
