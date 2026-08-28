---
schemaVersion: 1
module: 'packages/local-models/src/ranker'
sourceHash: 'fd50e99a5de298684f83567d1b5fd85de71e7d021a20d37ee58740ea9ecd7df7'
compiledAt: '2026-08-28T01:22:11.999Z'
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
