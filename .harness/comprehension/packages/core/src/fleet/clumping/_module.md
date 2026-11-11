---
schemaVersion: 1
module: 'packages/core/src/fleet/clumping'
sourceHash: '6b031465bf5149f1fca263146474f03b260eefd0037c2f451bc992dd07f6dc6e'
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
    'ordinals.test.ts',
    'ordinals.ts',
    'scope.test.ts',
    'scope.ts',
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
export Numbered
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
export scopeOfPath
export settleClumpVerdict
export toClumpView
export withOrdinals
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../craft/axes'
import { ClumpingConfig, ClumpingConfigSchema, clumpingFromConfig, reportIgnoredClumpingBlock, resolveSeamClumpPolicy } from './config'
import { ClumpMemberOutcome, checkVerdictPartition, planClumpPR, settleClumpVerdict } from './dispatch'
import { DEFAULT_CLUMP_POLICY, resolveClumpPolicy, resolveFloor } from './floor'
import { buildClump, formClumps } from './form'
import { withOrdinals } from './ordinals'
import { scopeOfPath } from './scope'
import { Clump, ClumpCounts, ClumpPolicy, ClumpResult, ClumpView, ClumpableItem, FloorContext, FloorVerdict, FlooredItem, Grade } from './types'
import { toClumpView } from './view'
import { createHash } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
