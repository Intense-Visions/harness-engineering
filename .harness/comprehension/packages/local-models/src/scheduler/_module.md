---
schemaVersion: 1
module: 'packages/local-models/src/scheduler'
sourceHash: 'ae9942178e29377b6c0fb1ad0d918183709fea18d848e0da2d282d61d7183951'
compiledAt: '2026-08-28T01:22:11.980Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'refresh.ts']
---

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
