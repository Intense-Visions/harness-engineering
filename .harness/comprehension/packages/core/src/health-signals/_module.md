---
schemaVersion: 1
module: 'packages/core/src/health-signals'
sourceHash: '370d22b1ddfde134c8de8020bc9268e77bcd0b6eb0139293f58166c16ae209f6'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.test.ts', 'index.ts']
---

## Interface Contract

```ts
export CHECK_SIGNAL_MAP
export HEALTH_SIGNAL_NAMES
export SIGNAL_CATEGORY_MAP
export SIGNAL_REGISTRY
export reconcilePassed
```

## Dependency Slice

```
import { CHECK_SIGNAL_MAP, HEALTH_SIGNAL_NAMES, SIGNAL_CATEGORY_MAP, SIGNAL_REGISTRY, SignalName, reconcilePassed } from './index'
import { describe, expect, it } from 'vitest'
```
