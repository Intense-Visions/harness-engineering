---
schemaVersion: 1
module: 'packages/local-models/tests/ranker'
sourceHash: '89ad0de6baf17c8fdec896334b18f910573ba88c3102c9d34fbc8dde2922b7c7'
compiledAt: '2026-08-28T01:22:12.070Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'agentic.test.ts',
    'algorithm.test.ts',
    'disk.test.ts',
    'evidence.test.ts',
    'harness-fit-buildquality.test.ts',
    'interpolate.test.ts',
    'quants.test.ts',
    'recency.test.ts',
    'speed.test.ts',
    'vram.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { HarnessFitResult, scoreBuildQuality } from '../../src/capability/harness-fit.js'
import { HardwareProfile } from '../../src/hardware/types.js'
import { AGENTIC_REASON, AgenticScoreInput, DEFAULT_LATENCY_BUDGET_MS, scoreAgentic } from '../../src/ranker/agentic.js'
import { BENCHMARK_CONFIDENCE_MULTIPLIER, SPEED_CONFIDENCE_MULTIPLIER, rankModels, scaleScore, weakestEvidence } from '../../src/ranker/algorithm.js'
import { BenchmarkEvidence, BenchmarkObservation, BenchmarkSnapshot, emptySnapshot } from '../../src/ranker/benchmarks/types.js'
import { estimateDiskGb } from '../../src/ranker/disk.js'
import { EVIDENCE_CONFIDENCE, gradeEvidence } from '../../src/ranker/evidence.js'
import { SeriesPoint, buildSeriesScores, interpolateBySize, seriesKey } from '../../src/ranker/interpolate.js'
import { QUANT_BITS_PER_WEIGHT, UNKNOWN_QUANT_BITS_PER_WEIGHT, normalizeQuantId } from '../../src/ranker/quants.js'
import { HALFLIFE_MONTHS, LINEAGE_STEP_PENALTY, MIN_RECENCY_WEIGHT, applyRecencyDecay } from '../../src/ranker/recency.js'
import { BACKEND_EFFICIENCY, estimateSpeed } from '../../src/ranker/speed.js'
import { LiveObservation, RankInput, RankerCandidate } from '../../src/ranker/types.js'
import { ACTIVATIONS_GB, DEFAULT_CONTEXT_TOKENS, FRAMEWORK_OVERHEAD_GB, estimateVram } from '../../src/ranker/vram.js'
import { describe, expect, it } from 'vitest'
```
