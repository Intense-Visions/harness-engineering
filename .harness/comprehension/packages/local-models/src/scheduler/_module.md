---
schemaVersion: 1
module: 'packages/local-models/src/scheduler'
sourceHash: 'ae9942178e29377b6c0fb1ad0d918183709fea18d848e0da2d282d61d7183951'
compiledAt: '2026-08-28T01:22:11.980Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'refresh.ts']
---

## Summary

The **scheduler** module (Phase 6) drives periodic refresh of the local model pool through a pure, timer-free tick pipeline and a guarded interval scheduler.

**`runRefreshTick`** executes a 6-step background refresh: (1) detect hardware (hard-stop gate), (2) rank candidates via recommender, (3) reconcile drift by pruning uninstalled models, (4) rewrite pool scores from the ranking, (5) diff the reconciled pool against new ranking, (6) emit proposals above threshold (deduped against pending/rejected).

The pipeline is **degradation-first**: every stage wraps errors into `TickResult.errors` and continues where safe. Only hardware detection is a hard stop.

**Optional harness-fit probe pass (D5)** runs cadence-gated on benchmark top-N, caches `buildQuality` per model+version, and re-ranks to surface convergence-capable models. Fail-open throughout.

**`RefreshScheduler`** wraps the tick in a jittered interval timer with an **overlap guard**: concurrent timer fires or `forceRefresh()` calls while a tick is in-flight share the same promise. Interval is clamped to `MIN_INTERVAL_MS` (1 hour) and jittered by `±jitterMs` to prevent fleet-wide thundering herd against external APIs.

## Invariants

- Hardware detection is a hard stop — without a hardware profile, the tick returns a hard-failure result and no later stage runs.
- Score writeback must precede diff — step 4 before step 5. Newly-installed entries at score 0 must be re-ranked first; diffing-first caused phantom swaps and inflated score deltas.
- Dedup suppression (F7) — the diff engine must never re-emit (target, replaces) pairs already in pending or rejected state, keyed by ollamaName.
- O4 hard-failure definition — a tick is hard-failed if and only if !snapshotLoaded && !hfReachable. This condition surfaces a non-zero exit / 503 response.
- Harness-fit probe is fail-open — any probe error leaves buildQuality undefined, producing no ranking effect. The entire probe pass is wrapped so it can never break the tick.
- Tool-calling probe runs exactly once per model — fires only when toolCalling === undefined during score writeback; a decided entry never re-probes.
- Overlap guard prevents concurrent ticks — tickInFlight ensures a second timer fire or forceRefresh() call shares the in-flight promise instead of spawning a second tick.
- Probe cadence gate — the harness-fit probe respects intervalMs and only runs when due; even an all-cached tick resets the cadence clock.
- Interval floor and jitter — the interval is clamped to MIN_INTERVAL_MS (1 hour); symmetric jitter ±jitterMs is applied so fleet instances do not stampede APIs in lockstep.
- Every stage is error-wrapped (except hardware) — failures are isolated on TickResult.errors, and the pipeline continues only with the hardware-detection exception.

## Interface Contract

```ts
export *
```

## Dependency Slice

```
import { DEFAULT_HARNESS_FIT_TASKS, HarnessFitProbeTask, HarnessFitRunner, scoreBuildQuality } from '../capability/harness-fit.js'
import { HarnessFitCacheEntry, HarnessFitCacheStore, ProbeCandidate, isProbeDue, probeCacheKey, selectProbeTargets } from '../capability/probe-policy.js'
import { HardwareProfile } from '../hardware/types.js'
import { ScoreUpdate } from '../pool/manager.js'
import { PoolEntry } from '../pool/types.js'
import { DedupPair, diffPoolAgainstRanking } from '../proposals/engine.js'
import { RecommendResult } from '../recommender/native.js'
import { ModelProposalContent } from '@harness-engineering/types'
```
