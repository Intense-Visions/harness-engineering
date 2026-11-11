---
schemaVersion: 1
module: 'packages/core/src/fleet/clumping'
sourceHash: 'e1f572c831cc7a9a776aa0320005480dafc96c18dfc9e74e7bdbe81d55d73337'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'config.test.ts',
    'config.ts',
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
export ClumpSeam
export ClumpVerdict
export ClumpVerdictOptions
export ClumpableItem
export ClumpingConfig
export ClumpingConfigSchema
export DEFAULT_CLUMP_POLICY
export FloorContext
export FloorVerdict
export FlooredItem
export Grade
export PostDropBuild
export checkVerdictPartition
export clumpingFromConfig
export formClumps
export planClumpPR
export reportIgnoredClumpingBlock
export resolveClumpPolicy
export resolveFloor
export resolveSeamClumpPolicy
export settleClumpVerdict
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../craft/axes'
import { ClumpingConfig, ClumpingConfigSchema, clumpingFromConfig, reportIgnoredClumpingBlock, resolveSeamClumpPolicy } from './config'
import { ClumpMemberOutcome, checkVerdictPartition, planClumpPR, settleClumpVerdict } from './dispatch'
import { DEFAULT_CLUMP_POLICY, resolveClumpPolicy, resolveFloor } from './floor'
import { buildClump, formClumps } from './form'
import { Clump, ClumpCounts, ClumpPolicy, ClumpResult, ClumpableItem, FloorContext, FloorVerdict, FlooredItem, Grade } from './types'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
