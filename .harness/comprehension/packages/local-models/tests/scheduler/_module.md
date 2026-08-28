---
schemaVersion: 1
module: 'packages/local-models/tests/scheduler'
sourceHash: 'fd686cdc1cf722e4c3b76c44ca6b3e0ede634cda33c0a6b9d852bcf1a53bd1e0'
compiledAt: '2026-08-28T01:22:12.063Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['drift-reconciliation.test.ts', 'refresh-harness-fit.test.ts', 'refresh.test.ts']
---

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
