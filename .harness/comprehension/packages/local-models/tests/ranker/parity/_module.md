---
schemaVersion: 1
module: 'packages/local-models/tests/ranker/parity'
sourceHash: '1bdd34a3cd1e1bfa774979a1a98df049fbce88997390bf74cfc28443a391f205'
compiledAt: '2026-08-28T01:22:12.046Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['algorithm-parity.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { HardwareProfile } from '../../../src/hardware/types.js'
import { rankModels } from '../../../src/ranker/algorithm.js'
import { loadFrozenSnapshot } from '../../../src/ranker/benchmarks/snapshot.js'
import { RankerCandidate } from '../../../src/ranker/types.js'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
```
