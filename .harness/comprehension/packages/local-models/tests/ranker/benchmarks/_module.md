---
schemaVersion: 1
module: 'packages/local-models/tests/ranker/benchmarks'
sourceHash: '69062e087926aa24d53ded3055f0b960e3f338277c2fc8819d19d05f14a54332'
compiledAt: '2026-08-28T01:22:12.049Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['merge.test.ts', 'snapshot.test.ts', 'sources.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DEFAULT_SOURCE_WEIGHTS, mergeBenchmarks } from '../../../src/ranker/benchmarks/merge.js'
import { loadFrozenSnapshot } from '../../../src/ranker/benchmarks/snapshot.js'
import { Fetcher, FetcherResponse, HF_POPULARITY_URL, LIKE_WEIGHT, OPEN_LLM_LEADERBOARD_URL, huggingFacePopularitySource, openLlmLeaderboardSource } from '../../../src/ranker/benchmarks/sources.js'
import { BenchmarkObservation } from '../../../src/ranker/benchmarks/types.js'
import { describe, expect, it } from 'vitest'
```
