---
schemaVersion: 1
module: 'packages/cli/src/api-craft/findings'
sourceHash: '339c76bcff9e27e0755997cebf7e598fd9f56b29794cdc4820b35bcca551f05a'
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
import { CraftAbstention } from '../../shared/craft/scope.js'
import { ApiSurfaceKind } from '../catalog/rubrics/types.js'
import { ClumpView } from '@harness-engineering/core'
```
