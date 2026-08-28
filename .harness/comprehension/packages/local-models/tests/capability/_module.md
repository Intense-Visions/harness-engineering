---
schemaVersion: 1
module: 'packages/local-models/tests/capability'
sourceHash: '5459d6f368d3ae125a6356e58ac8e26469668a64aff557c822b23a9b569e8a9a'
compiledAt: '2026-08-28T01:22:12.023Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'agentic.test.ts',
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
