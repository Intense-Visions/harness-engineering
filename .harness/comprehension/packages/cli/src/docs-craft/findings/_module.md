---
schemaVersion: 1
module: 'packages/cli/src/docs-craft/findings'
sourceHash: '6437b7f1752d13c08dfed76b2d8fca5d9d9b6d1d46cb5331ac0db71f7c9adec7'
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
import { DocKind } from '../catalog/rubrics/types.js'
import { ClumpResult } from '@harness-engineering/core'
```
