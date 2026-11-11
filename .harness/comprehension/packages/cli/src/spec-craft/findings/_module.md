---
schemaVersion: 1
module: 'packages/cli/src/spec-craft/findings'
sourceHash: 'b2a3ee57683a68d45d735a9fecd5427f44cc0fec164ed61bb8347c64254e52f5'
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
import { ClumpResult } from '@harness-engineering/core'
```
