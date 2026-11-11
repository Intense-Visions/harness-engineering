---
schemaVersion: 1
module: 'packages/cli/src/design-craft/findings'
sourceHash: '88d383bfc46ef8f6282e5c8af7e63f6e01669d8a39574a2d0bfa767e05bc0dd2'
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
import { ClumpResult } from '@harness-engineering/core'
```
