---
schemaVersion: 1
module: 'packages/cli/src/api-craft/findings'
sourceHash: 'fdb26d6af6fed6a0ddcc0b85cb97f166b2acf738b47523244864ce7f6d45b56a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['schema.ts']
---

## Interface Contract

```ts
export Confidence
export Impact
export Tier
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
import { ApiSurfaceKind } from '../catalog/rubrics/types.js'
import { ClumpResult } from '@harness-engineering/core'
```
