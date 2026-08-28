---
schemaVersion: 1
module: 'packages/local-models/tests/capability'
sourceHash: '5459d6f368d3ae125a6356e58ac8e26469668a64aff557c822b23a9b569e8a9a'
compiledAt: '2026-08-28T01:22:12.023Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: "claude-haiku-4-5-20251001"
semantic: present
members:
  [
    'agentic.test.ts',
## Summary

The `packages/local-models/tests/capability` module tests the build-quality probing subsystem—a cost-gated capability discovery framework that measures how well each local LLM candidate can act vs. merely narrate solutions.

It validates five layers: (1) agentic & tool-calling probes measure endpoint health and response latency, failing open gracefully; (2) scoring converts probe results into a [0,1] build-quality multiplier (HIGH~0.9+ for converged, MID~0.4–0.6 for acted-incomplete, LOW~0.1–0.2 for narrated-only); (3) cache persistence stores scores keyed by model+version+quantization with TTL-based freshness; (4) probe selection policy applies top-N cost gating, prefiltering for hardware-fit and tool-calling capability, cache freshness checks, and cadence gating; (5) portable task injection defines the runner contract—default tasks are self-describing with no monorepo paths or host-specific layout.

Tests drive an injected in-memory filesystem, fake fetch implementations, and deterministic clocks—no real Ollama, no real disk, no ambient system calls.

## Invariants

- Fail-open: errors never crash; probes return undefined or empty signals; absent cache entries do not trigger re-probes beyond top-N window
- No undefined properties: responses strictly honor exactOptionalPropertyTypes—only assign keys when values exist
- Converged-with-artifact only scores HIGH: convergence without file touches (e.g., trivially-passing acceptanceCommand) scores MID or LOW, never HIGH
- Top-N window applies before prefiltering: a prefiltered leader never pulls in the (N+1)-th row; the window is rank-based, not result-based
- Retry monotonicity: for converged results, more retries always decrease score, but score never leaves the HIGH band regardless of retry count
- Cache TTL gates re-probe: fresh entries skipped; stale or absent entries re-probed only when cadence gate permits (enabled AND interval elapsed)
- Cadence is opt-in and checked per-refresh: probe runs at most once per interval; disabled (default) means never
- Tool-calling capability gates the chat probe: if /api/show lacks 'tools', the expensive inference probe is skipped entirely
- Tasks are portable: default tasks contain no host-repo layout, absolute paths, or workspace-specific references—they ship to any adopter

    'harness-fit-cache-store.test.ts',
    'harness-fit-rerank.test.ts',
    'harness-fit-runner.test.ts',
    'harness-fit.test.ts',
    'probe-policy.test.ts',
    'tool-calling.test.ts',
  ]
---

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
