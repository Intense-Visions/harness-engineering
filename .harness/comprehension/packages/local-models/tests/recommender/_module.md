---
schemaVersion: 1
module: "packages/local-models/tests/recommender"
sourceHash: "3e14c7a7372a097ce9de633ac4ce66dcc00a2f1d4cbded48a9006673e46a27da"
compiledAt: "2026-08-28T01:22:12.047Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["native.test.ts"]
---

## Summary

The `packages/local-models/tests/recommender` module tests the native recommender engine, which ranks local LLM candidates (e.g., `qwen3:8b`, `qwen3:32b`) for a given hardware profile. The recommender loads a frozen benchmark snapshot of model performance metrics, scores each candidate against hardware constraints, and returns a ranked list sorted by descending score. It deliberately degrades gracefully on snapshot-loader failure and HF-API unreachability rather than throwing.

## Invariants

- Ranked output is sorted descending by score: result.ranked[i].score >= result.ranked[i+1].score
- Snapshot load failure is non-fatal: throws → snapshotLoaded: false, ranked: [], warnings populated; caller never crashes
- HF reachability is independent of ranking: HF API failure sets hfReachable: false but does not block ranking if snapshot loaded
- Never throws on any error path: both snapshot and HF failures return a valid result object (possibly empty/degraded) rather than rejecting
- Result schema is stable: every call returns { snapshotLoaded, hfReachable, ranked, warnings }

## Interface Contract

```ts

```

## Dependency Slice

```
import { HardwareProfile } from '../../src/hardware/types.js'
import { BenchmarkSnapshotLoadResult, emptySnapshot } from '../../src/ranker/benchmarks/types.js'
import { RankerCandidate } from '../../src/ranker/types.js'
import { createNativeRecommender } from '../../src/recommender/native.js'
import { describe, expect, it } from 'vitest'
```
