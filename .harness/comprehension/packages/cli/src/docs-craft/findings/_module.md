---
schemaVersion: 1
module: 'packages/cli/src/docs-craft/findings'
sourceHash: '02a000ad38182df0ec243c278cde723f0f38f90c6618a0fb39f9866518458be8'
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
import { ClumpView } from '@harness-engineering/core'
```
