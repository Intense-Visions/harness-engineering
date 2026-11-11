---
schemaVersion: 1
module: 'packages/cli/src/cli-ergonomics-craft/findings'
sourceHash: 'b8209c71ff546eaecf0ed4d506d3d7f6c0f26990cc1b3e93de2a52fccec3c0c4'
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
import { ClumpResult } from '@harness-engineering/core'
```
