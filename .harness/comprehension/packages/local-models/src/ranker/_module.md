---
schemaVersion: 1
module: 'packages/local-models/src/ranker'
sourceHash: '461834b57dc2366d0fb27ead0f23e5c3529a5986ee9a099c226695dd4b1e2cbd'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'agentic.ts',
    'algorithm.ts',
    'disk.ts',
    'evidence.ts',
    'index.ts',
    'interpolate.ts',
    'profiles.ts',
    'quants.ts',
    'recency.ts',
    'speed.ts',
    'types.ts',
    'vram.ts',
  ]
---

## Interface Contract

```ts
export *
export estimateDiskGb
```

## Dependency Slice

```
import { HardwareProfile } from '../hardware/types.js'
import { AgenticScore, DEFAULT_LATENCY_BUDGET_MS, scoreAgentic } from './agentic.js'
import { MergedScore, mergeBenchmarks } from './benchmarks/merge.js'
import { BenchmarkEvidence, BenchmarkObservation, BenchmarkSnapshot } from './benchmarks/types.js'
import { SeriesPoint, buildSeriesScores, interpolateBySize, seriesKey } from './interpolate.js'
import { RANK_PROFILES, RankProfile, classifyBenchmark } from './profiles.js'
import { NormalizedQuant, normalizeQuantId } from './quants.js'
import { SpeedBackend, SpeedEstimate, estimateSpeed } from './speed.js'
import { LiveObservation, RankInput, RankResult, RankedModel, RankerCandidate, RankerWarning } from './types.js'
import { KvCacheQuant, VramEstimate, VramEstimateInput, estimateVram } from './vram.js'
```
