---
schemaVersion: 1
module: 'packages/local-models/src/ranker/benchmarks'
sourceHash: '16793ec9143e171a6a57b02922ccbbd8a9546cd7ddfd1a25848c59a0cd249345'
compiledAt: '2026-08-28T01:22:11.994Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'merge.ts', 'snapshot.ts', 'sources.ts', 'types.ts']
---

## Summary

This module manages benchmark scoring for the local model ranker. It aggregates observations from multiple sources (Open LLM Leaderboard, HF popularity) into a unified scored result using a three-factor weighted mean: `weight = evidenceConfidence × recencyWeight × sourceWeight`. This reinforces stacked strong evidence and pulls weak claims down—not winner-takes-all. The module is resilience-focused: source adapters and the snapshot loader never throw; they degrade to warnings so the orchestrator can still produce a result when the network is down. The frozen snapshot is bundled at compile time. Evidence is graded on five levels (direct > variant > base > interpolated > self-reported). Confidence labels (high/medium/low) are deterministic, derived from the contribution mix: 'high' requires fresh direct evidence, 'low' if weak evidence or no strong grades, 'medium' otherwise.

## Invariants

- Weight composition is multiplicative: evidenceConfidence × recencyWeight × sourceWeight; zero in any factor zeros the contribution
- Never throws—snapshot loader, source adapters, and merge handle malformed input, returning warnings + safe defaults (empty snapshot or score:0, confidence:low)
- Evidence grades are ordered five-level hierarchy from direct (1.0) to self-reported (~0.35); adapters assign the grade; merge applies the multiplier from ../evidence.ts
- Recency penalty is time-based exponential decay with lineage penalty from ../recency.ts; HIGH_CONFIDENCE_RECENCY_FLOOR = 0.8 (~2 months) is the cutoff for high confidence
- All sources normalize to [0,100] before weighting; unknown sources clamp-and-pass; new adapters add a branch in normaliseValue() if they emit on a different scale
- Source weights are configurable with defaults: { 'open-llm-leaderboard': 1.0, 'hf-popularity': 0.25 }; unknown sources get DEFAULT_UNKNOWN_SOURCE_WEIGHT = 0.5; caller can override per merge call
- Confidence is deterministic—deriveConfidence() follows fixed rules; caller-supplied sourceWeights: { 'open-llm-leaderboard': 0 } correctly labels a zero-weight direct as not-high
- Empty input is safe—zero observations return { score: 0, confidence: 'low', contributions: [] }
- Snapshot is bundled at compile time via static import; esbuild inlines it; no runtime file reads
- Fetcher is injected, never global—source adapters take a Fetcher function; enables CI mocking and production wiring
- Contributions are transparent—each ScoredObservation emits all weighting factors for dashboard tooltips; callers can audit why a score landed at X
- Source warnings are structured with code | message | cause?; orchestrator can branch on code (fetch_failed | parse_failed | schema_invalid)

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
