---
schemaVersion: 1
module: 'packages/local-models/src/ranker'
sourceHash: 'fd50e99a5de298684f83567d1b5fd85de71e7d021a20d37ee58740ea9ecd7df7'
compiledAt: '2026-08-28T01:22:11.999Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The ranker module orchestrates conversion of hardware profiles, benchmarks, and speed estimates into ranked local-model candidates for agentic dispatch. It's pure (no I/O) and chains: agentic scoring (tool-calling → latency → composition gates) and ranking orchestration (VRAM → speed → benchmark merge → confidence scaling). Measured latency beats estimated (0.5× discount when unmeasured); evidence reports weakest contribution grade; high-confidence fits outrank low-confidence at equal raw score.

## Invariants

- Pure function: candidates + observations in, ranked models out; no side effects
- Sequential gates mandatory: hardware fit → tool-calling → latency; later gates skip if ineligible
- Measured > estimated always: unmeasured latency gets 0.5× discount + reason flag
- Latency response strictly decreasing: slower always scores lower than faster (monotonicity)
- Evidence weakest-link: picks least-strong contribution grade intentionally
- Multipliers clamped non-negative: buildQuality and agenticWeight floored at 0
- Unmeasured latency fallback: 600-token turn constant (coarse, steeply discounted)
- Tool-calling fail-open: unprobed (undefined) is flagged but eligible
- Confidence multipliers compound: speed and benchmark confidence both fold into final score
- Default filters unfitted: won't-fit candidates computed but removed; includeUnfit:true keeps at score=0 sorted bottom

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
