---
schemaVersion: 1
module: "packages/local-models/tests/ranker"
sourceHash: "89ad0de6baf17c8fdec896334b18f910573ba88c3102c9d34fbc8dde2922b7c7"
compiledAt: "2026-08-28T01:22:12.070Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["agentic.test.ts", "algorithm.test.ts", "disk.test.ts", "evidence.test.ts", "harness-fit-buildquality.test.ts", "interpolate.test.ts", "quants.test.ts", "recency.test.ts", "speed.test.ts", "vram.test.ts"]
---

## Summary

The `packages/local-models/tests/ranker` module tests a two-dimensional model selection system that ranks open-source LLMs by **primary score** (benchmark + speed + VRAM fit) and **agentic score** (tool-calling capability + latency). The ranker accepts hardware profiles (CPU/GPU, memory, bandwidth) and benchmark snapshots, then filters candidates that won't fit and scores the rest. The agentic dimension is a gating system: tool-calling is a hard gate (false → ineligible), unknown status fails open (eligible but flagged), and measured latency is preferred over estimated. The two-score design allows dispatch to prioritize tool-capable models even if they have lower benchmark scores.

## Invariants

- Tool-calling hard gate: toolCalling: false ⟹ agenticScore = 0 and agenticEligible = false; score reason must name 'no tool-calling'
- Fail-open on unknown: toolCalling: undefined ⟹ agenticEligible = true and reason includes AGENTIC_REASON.toolCallingUnknown
- Latency monotonicity under budget: For models with measuredAgenticLatencyMs < budget, agenticScore must decrease monotonically as latency rises, staying > 0
- Measured > estimated: Same effective latency via measured beats estimated; measured scores higher and estimated is flagged latencyEstimated
- Agentic triple always populated: rankModels() populates (agenticScore, agenticEligible, agenticReasons) for all candidates, even if agentic fields are absent in input
- Primary order stable when agentic absent: Ranking order by score (benchmark-based) unchanged by absent agentic fields; absent toolCalling fails open
- Agentic dispatch reordering: Sorting by agenticScore must rank a tool-capable model with lower raw score ahead of an incapable model with higher raw score
- Score bounds: All scores in [0, 100]; fitsHardware: false filters from default result
- Evidence grading: Direct evidence produces higher scores than indirect (e.g., interpolated or inferred)
- Snapshot provenance: snapshotDate tracked in result; freshness affects confidence multipliers (recency decay applies)

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
