---
schemaVersion: 1
module: 'packages/local-models/tests/proposals'
sourceHash: '03928d412c9f1b26889cd762b7fbe293cfa076329a90340643c345d9f67f30fa'
compiledAt: '2026-08-28T01:22:12.044Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['engine.test.ts', 'justification.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { PoolEntry, PoolState } from '../../src/pool/types.js'
import { diffPoolAgainstRanking } from '../../src/proposals/engine.js'
import { buildJustification } from '../../src/proposals/justification.js'
import { estimateDiskGb } from '../../src/ranker/disk.js'
import { RankedModel } from '../../src/ranker/types.js'
import { describe, expect, it } from 'vitest'
```
