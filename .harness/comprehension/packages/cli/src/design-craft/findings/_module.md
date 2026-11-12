---
schemaVersion: 1
module: 'packages/cli/src/design-craft/findings'
sourceHash: 'ab6c3dc00d285360ad10b78f482ad8f337bfdd72923044353cc70fc7c15eb838'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['derived.ts', 'schema.ts']
---

## Interface Contract

```ts
export Confidence
export Impact
export Tier
export derivePriority
```

## Dependency Slice

```
import { ResponsiveGateResult } from '../../responsive/index.js'
import { Confidence, Impact, Tier } from '../../shared/craft/findings/axes.js'
import { ClumpView } from '@harness-engineering/core'
```
