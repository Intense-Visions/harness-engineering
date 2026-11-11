---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/findings'
sourceHash: '14b31b352713c3444faa16c28b7804719b451f025f93fb0a5984bdea928da7a0'
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
export craftKind
export craftScope
export derivePriority
export toClumpableItems
```

## Dependency Slice

```
import { CodeFinding } from '../../../code-craft/findings/schema.js'
import { CraftFinding } from '../../../design-craft/findings/schema.js'
import { Confidence, Impact, Tier } from './axes.js'
import { CraftClumpableFinding, clumpCraftFindings, craftKind, craftScope, toClumpableItems } from './clumpable.js'
import { derivePriority } from './derived.js'
import { ClumpPolicy, ClumpResult, ClumpableItem, Confidence, CraftTier, Impact, formClumps } from '@harness-engineering/core'
import { describe, expect, it } from 'vitest'
```
