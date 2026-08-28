---
schemaVersion: 1
module: 'packages/local-models/src/ranker/benchmarks'
sourceHash: '16793ec9143e171a6a57b02922ccbbd8a9546cd7ddfd1a25848c59a0cd249345'
compiledAt: '2026-08-28T01:22:11.994Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'merge.ts', 'snapshot.ts', 'sources.ts', 'types.ts']
---

## Interface Contract

```ts
export BenchmarkEvidence
export BenchmarkObservation
export BenchmarkSnapshot
export BenchmarkSnapshotLoadResult
export BenchmarkSnapshotWarning
export BenchmarkSource
export BenchmarkSourceFetchOptions
export BenchmarkSourceResult
export DEFAULT_SOURCE_WEIGHTS
export DEFAULT_UNKNOWN_SOURCE_WEIGHT
export Fetcher
export FetcherResponse
export HF_POPULARITY_URL
export HIGH_CONFIDENCE_RECENCY_FLOOR
export LIKE_WEIGHT
export LOW_CONFIDENCE_WEIGHT_FLOOR
export MergeInput
export MergeTarget
export MergedScore
export ModelBenchmark
export OPEN_LLM_LEADERBOARD_URL
export ScoredObservation
export SourceWarning
export SourceWarningCode
export emptySnapshot
export huggingFacePopularitySource
export loadFrozenSnapshot
export mergeBenchmarks
export openLlmLeaderboardSource
```

## Dependency Slice

```
import { EVIDENCE_CONFIDENCE } from '../evidence.js'
import { applyRecencyDecay } from '../recency.js'
import bundledSnapshot from './snapshot.json'
import { BenchmarkEvidence, BenchmarkObservation, BenchmarkSnapshot, BenchmarkSnapshotLoadResult, BenchmarkSnapshotWarning, ModelBenchmark, emptySnapshot } from './types.js'
```
