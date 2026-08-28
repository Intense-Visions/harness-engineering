---
schemaVersion: 1
module: 'packages/core/src/rollback'
sourceHash: '19ce7e19a5494acc048047a40ef0e2bf46c1ac6efd0e7373fd8def464eb6dc23'
compiledAt: '2026-08-28T01:22:10.571Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['classify.test.ts', 'classify.ts', 'index.ts', 'io.ts', 'types.ts']
---

## Interface Contract

```ts
export ClassifyInput
export LaterMerge
export ResolvedTarget
export RollbackDecision
export RollbackIO
export classifyRevert
```

## Dependency Slice

```
import { classifyRevert } from './classify'
import { RollbackIO } from './io'
import { ClassifyInput, RollbackDecision } from './types'
import { describe, expect, it } from 'vitest'
```
