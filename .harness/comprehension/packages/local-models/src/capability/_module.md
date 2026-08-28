---
schemaVersion: 1
module: 'packages/local-models/src/capability'
sourceHash: 'a50575c5606968905c3d26ba9c16c3964f098c66e7eebf9593fdecf661008542'
compiledAt: '2026-08-28T01:22:11.965Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'agentic.ts',
    'harness-fit-cache-store.ts',
    'harness-fit-rerank.ts',
    'harness-fit.ts',
    'index.ts',
    'probe-policy.ts',
    'tool-calling.ts',
  ]
---

## Summary

The `capability` module implements the D5 (agentic suitability) dimension of the harness-fit probe—a cost-gated system for measuring whether local models can drive agentic builds and score their build quality. It decomposes into three layers: (1) **Probes** that measure tool-calling capability and agentic latency with fail-open semantics; (2) **Scoring** that maps probe results (convergence, artifact production, tool calls, retries) to a [0,1] buildQuality score in three bands—HIGH for converged with files, MID for action without convergence, LOW for narration only; (3) **Policy & Storage** comprising pure gating logic to select top-N candidates for probing, persistent disk-backed caching keyed by model+version+quant, and re-ranking that threads probed scores back into the existing recommender without duplicating ranking math.

## Invariants

- Cost gate applied to full ranked list first: Top-N window selected from benchmark-ranked shortlist before prefiltering, so the N+1-th model is never probed even if top-N filters away all candidates
- Cache key is model+version+quant: Ollama tag embeds release; quant re-quantization yields different build behavior, so both are load-bearing
- Freshness check allows positive clock skew: isCacheFresh treats probedAt > now as fresh (no negative-age stale), protecting against minor clock drift on persist
- Converged-but-no-artifact is suspect: Model passing gate without touching files does NOT score HIGH—falls to MID/LOW to avoid ranking narration-only models alongside real actors
- Tool-calling is two-stage, cheap-first: /api/show capability gate (free) rules out no-tools models; only candidates claiming tools proceed to /v1/chat/completions ground-truth inference
- Undefined buildQuality has no ranking effect: Failed probes return undefined; ranker treats undefined buildQuality as absent—fail-open by design
- Persist chain serializes writes: Internal persistChain Promise serializes cache writes so fire-and-forget set() and explicit persist() cannot interleave on the same .tmp file
- Fail-open throughout disk I/O: Missing, malformed, or version-mismatched cache files degrade to empty store with warning—never throw, never break the tick
- ReRanker reuses existing recommendation algorithm: No ranking math reimplemented; re-rank clones candidates, stamps buildQuality, re-invokes the same recommend(hardware) binding
- Probes run sequentially, not concurrent: Tool-calling and latency probes run in series to avoid hammering shared local Ollama backend with concurrent turns

## Interface Contract

```ts
export AgenticSignals
export BUILD_QUALITY
export BuildQualityReRanker
export DEFAULT_HARNESS_FIT_CACHE_PATH
export DEFAULT_HARNESS_FIT_TASKS
export HARNESS_FIT_CACHE_VERSION
export HarnessFitCacheEntry
export HarnessFitCacheFile
export HarnessFitCacheFileStore
export HarnessFitCacheFilesystem
export HarnessFitCacheStore
export HarnessFitCacheStoreOptions
export HarnessFitProbeTask
export HarnessFitResult
export HarnessFitRunner
export ProbeAgenticDeps
export ProbeCadenceOptions
export ProbeCadenceState
export ProbeCandidate
export ProbeToolCallingDeps
export Recommend
export SelectProbeTargetsOptions
export createBuildQualityReRanker
export isCacheFresh
export isProbeDue
export probeAgenticSignals
export probeCacheKey
export probeToolCalling
export scoreBuildQuality
export selectProbeTargets
```

## Dependency Slice

```
import { HardwareProfile } from '../hardware/types.js'
import { RankedModel, RankerCandidate } from '../ranker/types.js'
import { RecommendResult } from '../recommender/native.js'
import { HarnessFitCacheEntry, HarnessFitCacheStoreApi, probeCacheKey } from './probe-policy.js'
import { probeToolCalling } from './tool-calling.js'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
```
