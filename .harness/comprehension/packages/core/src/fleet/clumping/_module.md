---
schemaVersion: 1
module: 'packages/core/src/fleet/clumping'
sourceHash: '70fe56be0f0a0429b49dfe0e1bc5e724aca6b7e28e1b25af9f6cc85190b86eec'
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
    'view.test.ts',
    'view.ts',
  ]
---

## Interface Contract

```ts
export Clump
export ClumpCommit
export ClumpCounts
export ClumpDrop
export ClumpMemberOutcome
export ClumpMemberView
export ClumpPRPlan
export ClumpPlanOptions
export ClumpPolicy
export ClumpResult
export ClumpSeam
export ClumpUnitView
export ClumpVerdict
export ClumpVerdictOptions
export ClumpView
export ClumpableItem
export ClumpingConfig
export ClumpingConfigSchema
export DEFAULT_CLUMP_POLICY
export FloorContext
export FloorVerdict
export FlooredItem
export FlooredItemView
export Grade
export PlannableClump
export PlannableMember
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
export toClumpView
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../craft/axes'
import { ClumpingConfig, ClumpingConfigSchema, clumpingFromConfig, reportIgnoredClumpingBlock, resolveSeamClumpPolicy } from './config'
import { ClumpMemberOutcome, checkVerdictPartition, planClumpPR, settleClumpVerdict } from './dispatch'
import { DEFAULT_CLUMP_POLICY, resolveClumpPolicy, resolveFloor } from './floor'
import { buildClump, formClumps } from './form'
import { Clump, ClumpCounts, ClumpPolicy, ClumpResult, ClumpView, ClumpableItem, FloorContext, FloorVerdict, FlooredItem, Grade } from './types'
import { toClumpView } from './view'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
