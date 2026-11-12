---
schemaVersion: 1
module: 'packages/cli/src/api-craft/findings'
sourceHash: '3ced2bb20037230468390b926c2a6313310c6507bdfdceb3e7a052b226c36148'
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
import { ClumpView } from '@harness-engineering/core'
```
