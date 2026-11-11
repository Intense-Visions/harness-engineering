---
schemaVersion: 1
module: 'packages/cli/src/test-craft/findings'
sourceHash: '92b8962c2c775227b571fe72528b42566b8ee8012e4254f0477d100c2ab0f9d4'
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
