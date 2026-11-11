---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/findings'
sourceHash: 'f4e2cf4f19dbf96f9a5012a2369db84c6cdd3e95bab7661996cd95aed8e969b1'
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
import { ClumpPolicy, ClumpResult, ClumpableItem, ClumpingConfig, Confidence, CraftTier, Impact, clumpingFromConfig, formClumps, reportIgnoredClumpingBlock, resolveSeamClumpPolicy } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
