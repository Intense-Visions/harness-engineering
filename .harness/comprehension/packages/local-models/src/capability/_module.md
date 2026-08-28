---
schemaVersion: 1
module: 'packages/local-models/src/capability'
sourceHash: 'a50575c5606968905c3d26ba9c16c3964f098c66e7eebf9593fdecf661008542'
compiledAt: '2026-08-28T01:22:11.965Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
