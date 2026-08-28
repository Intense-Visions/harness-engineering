---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/findings'
sourceHash: '9f7ba8dda724e742a8feb4b2f7a3c1714cdffe58898ce649e29bedc0fff84e20'
compiledAt: '2026-08-28T01:22:09.342Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['axes.ts', 'derived.test.ts', 'derived.ts']
---

## Interface Contract

```ts
export CONFIDENCE_RANK
export derivePriority
```

## Dependency Slice

```
import { Confidence, Impact, Tier } from './axes.js'
import { derivePriority } from './derived.js'
import { describe, expect, it } from 'vitest'
```
