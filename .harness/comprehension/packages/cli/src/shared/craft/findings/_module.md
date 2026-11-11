---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/findings'
sourceHash: 'fb46fc1df1d698371af389f53d0b470689ba9da8a3544ab4e9d12c66e8a3ca19'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['axes.ts', 'clumpable.test.ts', 'clumpable.ts', 'derived.test.ts', 'derived.ts']
---

## Interface Contract

```ts
export CONFIDENCE_RANK
export Confidence
export Impact
export Tier
export clumpCraftFindings
export craftClumpView
export craftClumpingConfig
export craftKind
export craftPath
export derivePriority
export toClumpableItems
```

## Dependency Slice

```
import { CodeFinding } from '../../../code-craft/findings/schema.js'
import { CraftFinding } from '../../../design-craft/findings/schema.js'
import { Confidence, Impact, Tier } from './axes.js'
import { CraftClumpableFinding, clumpCraftFindings, craftClumpView, craftClumpingConfig, craftKind, craftPath, toClumpableItems } from './clumpable.js'
import { derivePriority } from './derived.js'
import { ClumpPolicy, ClumpResult, ClumpView, ClumpableItem, ClumpingConfig, Confidence, CraftTier, Impact, clumpingFromConfig, formClumps, reportIgnoredClumpingBlock, resolveSeamClumpPolicy, scopeOfPath, toClumpView, withOrdinals } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
