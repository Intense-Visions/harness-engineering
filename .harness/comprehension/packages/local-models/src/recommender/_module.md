---
schemaVersion: 1
module: 'packages/local-models/src/recommender'
sourceHash: 'dbbf05c660890cbe76e0011205a5c9fa134922a0b4a84eb870c3c0408fe38e91'
compiledAt: '2026-08-28T01:22:11.983Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'native.ts']
---

## Interface Contract

```ts
export *
```

## Dependency Slice

```
import { HardwareProfile } from '../hardware/types.js'
import { HuggingFaceClient } from '../huggingface/index.js'
import { rankModels } from '../ranker/algorithm.js'
import { BenchmarkSnapshotLoadResult, loadFrozenSnapshot } from '../ranker/benchmarks/index.js'
import { RankedModel, RankerCandidate } from '../ranker/types.js'
```
