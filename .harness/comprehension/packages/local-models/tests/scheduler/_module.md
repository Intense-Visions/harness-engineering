---
schemaVersion: 1
module: "packages/local-models/tests/scheduler"
sourceHash: "fd686cdc1cf722e4c3b76c44ca6b3e0ede634cda33c0a6b9d852bcf1a53bd1e0"
compiledAt: "2026-08-28T01:22:12.063Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["drift-reconciliation.test.ts", "refresh-harness-fit.test.ts", "refresh.test.ts"]
---

## Summary

The `packages/local-models/tests/scheduler` module tests the refresh-tick lifecycle—a periodic update cycle that reconciles the pool state against Ollama's actual installed models, optionally probes build quality for top-N candidates, and re-ranks + proposes model upgrades. Two core scenarios: (1) Drift Reconciliation (F10) validates that externally-removed models are detected, pool entries removed, disk budget freed, and removal reported via `TickResult.reconciledRemoved` and `onWarn` callback. (2) Harness-Fit Probe Pass (Phase 3/Task 1) validates cadence-based probing of top-N models for build-quality metrics (convergence, tool calls, retries), result caching with TTL, re-ranking with buildQuality scores, and fail-open error handling. All tests use in-memory mocks—no real Ollama or disk.

## Invariants

- Drift detection & removal: Pool entry removed, budget freed, reported in TickResult.reconciledRemoved AND logged via onWarn callback
- Cadence enforcement: Probe skipped when now() - lastProbeAt < intervalMs; no probe occurs until interval expires
- Cache hygiene: Fresh cache entry (TTL not expired) skips probe; stale entry triggers re-probe; cache key depends on model + task
- Build quality re-ranking: Probe results must feed into reRankWithBuildQuality with a buildQuality: Map<ollamaName, score>
- Fail-open on runner error: Runner exceptions do not crash tick; buildQuality remains undefined; re-rank skipped
- Top-N boundary: Only topN candidates are probed, even if ranking has more entries
- Probe-absent byte-identity: Tick without probe config must produce identical TickResult as before probe wiring existed
- Hardware + recommend always complete: Even if probe fails, hardware detection and recommendation must finish successfully

## Interface Contract

```ts

```

## Dependency Slice

```
import { HarnessFitProbeTask, HarnessFitResult } from '../../src/capability/harness-fit.js'
import { HarnessFitCacheEntry, HarnessFitCacheStore, probeCacheKey } from '../../src/capability/probe-policy.js'
import { HardwareProfile } from '../../src/hardware/types.js'
import { RemoteModelInfo } from '../../src/installer/index.js'
import { PoolManager } from '../../src/pool/manager.js'
import { PoolFilesystem, PoolStateStore } from '../../src/pool/state.js'
import { PoolState } from '../../src/pool/types.js'
import { RankedModel } from '../../src/ranker/types.js'
import { RecommendResult } from '../../src/recommender/native.js'
import { HarnessFitProbeDeps, MIN_INTERVAL_MS, RefreshScheduler, RefreshTickDeps, TickResult, isTickHardFailure, runRefreshTick } from '../../src/scheduler/refresh.js'
import { describe, expect, it, vi } from 'vitest'
```
