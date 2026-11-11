---
schemaVersion: 1
module: 'packages/core/src/fleet/clumping'
sourceHash: '9c344be0542a43928ca2a1d03e1d936cae8fcc70911ed882ea66096a72276bc2'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'dispatch.test.ts',
    'dispatch.ts',
    'floor.test.ts',
    'floor.ts',
    'form.test.ts',
    'form.ts',
    'index.ts',
    'laws.test.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export Clump
export ClumpCommit
export ClumpCounts
export ClumpDrop
export ClumpMemberOutcome
export ClumpPRPlan
export ClumpPlanOptions
export ClumpPolicy
export ClumpResult
export ClumpVerdict
export ClumpVerdictOptions
export ClumpableItem
export DEFAULT_CLUMP_POLICY
export FloorContext
export FloorVerdict
export FlooredItem
export Grade
export PostDropBuild
export checkVerdictPartition
export formClumps
export planClumpPR
export resolveClumpPolicy
export resolveFloor
export settleClumpVerdict
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../craft/axes'
import { ClumpMemberOutcome, checkVerdictPartition, planClumpPR, settleClumpVerdict } from './dispatch'
import { DEFAULT_CLUMP_POLICY, resolveClumpPolicy, resolveFloor } from './floor'
import { buildClump, formClumps } from './form'
import { Clump, ClumpCounts, ClumpPolicy, ClumpResult, ClumpableItem, FloorContext, FloorVerdict, FlooredItem, Grade } from './types'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
```
