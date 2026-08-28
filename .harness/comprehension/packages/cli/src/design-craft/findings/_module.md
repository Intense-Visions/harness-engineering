---
schemaVersion: 1
module: 'packages/cli/src/design-craft/findings'
sourceHash: '20ed257def1ae4b6d31d4505e18e262ca1ad12af80dd386d62102939b86d035d'
compiledAt: '2026-08-28T01:22:09.038Z'
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
```
