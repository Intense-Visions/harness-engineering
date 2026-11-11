---
schemaVersion: 1
module: 'packages/core/src/fleet/clumping'
sourceHash: 'd5a9734dc5b95cabbc2cca51a5f340f0bc84785f47ed5c67c8b68366d3421c68'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['floor.test.ts', 'floor.ts', 'types.ts']
---

## Interface Contract

```ts
export DEFAULT_CLUMP_POLICY
export resolveClumpPolicy
export resolveFloor
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../craft/axes'
import { DEFAULT_CLUMP_POLICY, resolveClumpPolicy, resolveFloor } from './floor'
import { ClumpPolicy, ClumpableItem, FloorContext, FloorVerdict, Grade } from './types'
import { describe, expect, it } from 'vitest'
```
