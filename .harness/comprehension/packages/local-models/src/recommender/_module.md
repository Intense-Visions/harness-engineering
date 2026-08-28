---
schemaVersion: 1
module: 'packages/local-models/src/recommender'
sourceHash: 'dbbf05c660890cbe76e0011205a5c9fa134922a0b4a84eb870c3c0408fe38e91'
compiledAt: '2026-08-28T01:22:11.983Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'native.ts']
---

## Summary

The `recommender` module (Phase 6) is a pure ranking seam that converts an explicit candidate set into hardware-aware recommendations. It exports `createNativeRecommender`, a factory returning a pure `recommend(hardware)` function that loads a frozen benchmark snapshot and ranks candidates against it. HuggingFace reachability is probed as best-effort for context but never blocks. Degradation-first design: snapshot load failure is fatal (returns empty ranking + warning); HF unreachability is benign (only sets a flag). All errors surface as accumulated warnings; the function never throws.

## Invariants

- Explicit candidates, no discovery: callers pass the candidate set directly; the recommender does not fetch from HuggingFace (discovery is ../candidates/discover.ts, wired separately by the orchestrator)
- Snapshot load is mandatory: benchmark snapshot must load successfully or the result is an empty ranking; a thrown error triggers the hard-failure path (empty ranked[], snapshotLoaded: false)
- HF probe is optional and non-fatal: if hfClient is omitted or its listModels call fails, hfReachable: false but ranking completes normally
- All errors accumulate as warnings: never rethrow; warnings surface in RecommendResult.warnings so callers can inspect degradation state without exception handling
- Ranking is deterministic per snapshot: given the same hardware, candidates, and snapshot, rankModels produces the same order; no per-call state

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
