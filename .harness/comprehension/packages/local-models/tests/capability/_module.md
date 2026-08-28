---
schemaVersion: 1
module: "packages/local-models/tests/capability"
sourceHash: "5459d6f368d3ae125a6356e58ac8e26469668a64aff557c822b23a9b569e8a9a"
compiledAt: "2026-08-28T12:05:49.243Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["agentic.test.ts", "harness-fit-cache-store.test.ts", "harness-fit-rerank.test.ts", "harness-fit-runner.test.ts", "harness-fit.test.ts", "probe-policy.test.ts", "tool-calling.test.ts"]
---

## Summary

The `capability` test module validates the local-models probing and ranking infrastructure across three subsystems. **Agentic Signal Probing** tests low-level model capability detection—whether a model emits tool calls vs. text-only output and measured latency—with fail-open behavior on transport errors. **Persistent Cache** validates the buildQuality scoring cache (JSON file backed, in-memory fallback), covering set/get round-trips, persist/reload cycles, freshness checks (age vs. TTL), and probe cadence tracking, with graceful degradation on missing or corrupted files. **Build-Quality Re-Ranking** proves that cached buildQuality scores can re-order models at equal benchmark score by wrapping the native recommender with buildQuality-augmented candidates, using fail-open semantics for missing cache keys.

## Invariants

- Fail-open on transport: probeAgenticSignals never throws; connection errors and malformed responses degrade to undefined signals
- Exact optional properties: prober omits undefined properties (not {x: undefined}); callers check with hasOwnProperty before accessing
- Tool-calling reflects behavior, not capability: a model can advertise ['tools'] but emit text-only; toolCalling field is actual, not declared
- Cache freshness is pure and stateless: isCacheFresh(entry, now, ttl) predicate judges by age + probedAt timestamp independent of store state
- Persistent store round-trips correctly: set(key, entry) → persist() → new Store().load().get(key) returns identical entry
- Cadence timestamps persist across reload: setLastProbeAt() / getLastProbeAt() survives store restart for re-probe gating
- File errors degrade gracefully: missing or malformed cache files do not throw; store initializes empty with optional warning callback
- Re-ranking preserves zero-buildQuality: candidates without cache entries remain unaugmented; baseline ranking is byte-identical to non-buildQuality recommender
- Build quality re-orders at equal benchmark: two candidates with identical benchmark scores are separated by agenticScore when one has higher buildQuality

## Interface Contract

```ts

```

## Dependency Slice

```
import { probeAgenticSignals } from '../../src/capability/agentic.js'
import { HarnessFitCacheFileStore, HarnessFitCacheFilesystem } from '../../src/capability/harness-fit-cache-store.js'
import { createBuildQualityReRanker } from '../../src/capability/harness-fit-rerank.js'
import { BUILD_QUALITY, DEFAULT_HARNESS_FIT_TASKS, HarnessFitProbeTask, HarnessFitResult, HarnessFitRunner, scoreBuildQuality } from '../../src/capability/harness-fit.js'
import { HarnessFitCacheEntry, HarnessFitCacheStore, ProbeCandidate, isCacheFresh, isProbeDue, probeCacheKey, selectProbeTargets } from '../../src/capability/probe-policy.js'
import { probeToolCalling } from '../../src/capability/tool-calling.js'
import { HardwareProfile } from '../../src/hardware/types.js'
import { BenchmarkSnapshot } from '../../src/ranker/benchmarks/types.js'
import { RankerCandidate } from '../../src/ranker/types.js'
import { createNativeRecommender } from '../../src/recommender/native.js'
import { describe, expect, it, vi } from 'vitest'
```
