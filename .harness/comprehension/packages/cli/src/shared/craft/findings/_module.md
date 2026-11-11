---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/findings'
sourceHash: 'd043535e896462ed2ac2235812e50b3c7ed3f504cf4f49a6419896def3224d00'
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
import { CraftClumpableFinding, clumpCraftFindings, craftKind, craftPath, craftScope, toClumpableItems } from './clumpable.js'
import { derivePriority } from './derived.js'
import { ClumpPolicy, ClumpResult, ClumpableItem, Confidence, CraftTier, Impact, formClumps } from '@harness-engineering/core'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
```
