---
schemaVersion: 1
module: 'packages/cli/src/test-craft/findings'
sourceHash: 'aa5230bccd52deb2ea04f2452d36b4eb62a8c0da9ee678863d0c40c84798af0c'
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
import { ClumpView } from '@harness-engineering/core'
```
