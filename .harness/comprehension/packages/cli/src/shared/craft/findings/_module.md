---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/findings'
sourceHash: '563ea8e5f08ee6f9bbd4024e99a2f4764947b27ee659e976dacf4ddca2264c19'
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
import { ClumpPolicy, ClumpPolicyOverlay, ClumpResult, ClumpView, ClumpableItem, ClumpingConfig, Confidence, CraftTier, Impact, clumpingFromConfig, formClumps, overlayClumpPolicy, reportIgnoredClumpingBlock, resolveSeamClumpPolicy, scopeOfPath, toClumpView, withOrdinals } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
