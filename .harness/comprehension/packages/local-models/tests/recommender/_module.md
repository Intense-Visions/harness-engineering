---
schemaVersion: 1
module: 'packages/local-models/tests/recommender'
sourceHash: '3e14c7a7372a097ce9de633ac4ce66dcc00a2f1d4cbded48a9006673e46a27da'
compiledAt: '2026-08-28T01:22:12.047Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['native.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { HardwareProfile } from '../../src/hardware/types.js'
import { BenchmarkSnapshotLoadResult, emptySnapshot } from '../../src/ranker/benchmarks/types.js'
import { RankerCandidate } from '../../src/ranker/types.js'
import { createNativeRecommender } from '../../src/recommender/native.js'
import { describe, expect, it } from 'vitest'
```
