---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft/findings'
sourceHash: '73658fca745cbec986d1dd783487038c8bc0653da3c26137666d2db4c2b7ae7e'
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
import { CommandKind } from '../catalog/rubrics/types.js'
import { ClumpView } from '@harness-engineering/core'
```
