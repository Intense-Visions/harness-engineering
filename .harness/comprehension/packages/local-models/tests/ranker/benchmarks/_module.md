---
schemaVersion: 1
module: "packages/local-models/tests/ranker/benchmarks"
sourceHash: "69062e087926aa24d53ded3055f0b960e3f338277c2fc8819d19d05f14a54332"
compiledAt: "2026-08-28T01:22:12.049Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["merge.test.ts", "snapshot.test.ts", "sources.test.ts"]
---

## Summary

This test module validates the benchmark scoring pipeline for the local model ranker. It covers three operations: (1) merging multiple benchmark sources into a single 0–100 score using multiplicative weighting of evidence confidence, recency decay, and source weights; (2) loading and validating the frozen benchmark snapshot with graceful fallback on schema mismatches; (3) fetching live observations from Open LLM Leaderboard and HuggingFace popularity APIs with structured error handling. The merge respects evidence hierarchy (direct > self-reported), applies recency penalties to stale observations, and derives confidence labels deterministically from actual contribution strength rather than raw observation presence.

## Invariants

- mergeBenchmarks() never throws; empty input returns {score: 0, confidence: 'low', contributions: []}
- Evidence hierarchy is load-bearing: direct > variant > base > interpolated > self-reported determines weight multipliers
- Confidence labels reflect actual weighted contributions; zero-weighted observations do not qualify for 'high' even if direct
- Recency decay is applied consistently using observedAt vs snapshotDate; stale data is demoted even at identical raw values
- Combined weight is strictly multiplicative: evidenceConfidence × recencyWeight × sourceWeight (any zero factor → zero contribution)
- Source-native benchmark values are normalized to [0,100]; unknown sources clamp to this range
- loadFrozenSnapshot() always returns a valid snapshot (frozen or graceful fallback); never throws on schema validation failure
- Unknown evidence grades trigger fallback with a warning; malformed snapshots are not silently adopted
- Merged score = (Σ weightedValue / Σ combinedWeight) × 100; order of observations is irrelevant
- Source adapters surface structured warnings (fetch_failed, parse_failed, schema_invalid) while returning safe partial results

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
