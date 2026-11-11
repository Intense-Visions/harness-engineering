---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/findings'
sourceHash: 'eb555e72efc44bc1abe63a7d04c212385aaad5727bb60f3a8cbe18532008393c'
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
export craftClumpPolicy
export craftClumpingConfig
export craftKind
export craftPath
export craftScope
export derivePriority
export toClumpableItems
```

## Dependency Slice

```
import { CodeFinding } from '../../../code-craft/findings/schema.js'
import { CraftFinding } from '../../../design-craft/findings/schema.js'
import { Confidence, Impact, Tier } from './axes.js'
import { CraftClumpableFinding, clumpCraftFindings, craftClumpingConfig, craftKind, craftPath, craftScope, toClumpableItems } from './clumpable.js'
import { derivePriority } from './derived.js'
import { ClumpPolicy, ClumpResult, ClumpableItem, ClumpingConfig, ClumpingConfigSchema, Confidence, CraftTier, Impact, formClumps, resolveSeamClumpPolicy } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
