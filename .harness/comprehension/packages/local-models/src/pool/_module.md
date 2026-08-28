---
schemaVersion: 1
module: 'packages/local-models/src/pool'
sourceHash: '523fdedbdc036644634aecbb9aa70de784b718e9e8c4c21ff16a4b9e135110ba'
compiledAt: '2026-08-28T01:22:11.977Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['eviction.ts', 'index.ts', 'manager.ts', 'provider.ts', 'state.ts', 'types.ts']
---

## Interface Contract

```ts
export AllowCheckRequest
export ConfigurePoolRequest
export DEFAULT_POOL_STATE_PATH
export EmptyPoolState
export EvictPoolRequest
export EvictPoolResult
export EvictionCandidate
export EvictionPlan
export EvictionRequest
export InstallPoolRequest
export InstallPoolResult
export POOL_STATE_VERSION
export PoolCandidateOptions
export PoolEntry
export PoolEntryView
export PoolFilesystem
export PoolManager
export PoolManagerErrorCode
export PoolManagerOptions
export PoolState
export PoolStateFile
export PoolStateProvider
export PoolStateStore
export PoolStateStoreOptions
export PoolStateView
export ReconcileRequest
export ReconcileResult
export ScoreUpdate
export isPoolStateFile
export planEviction
export poolStateToCandidates
export sortByEvictionOrder
```

## Dependency Slice

```
import { EvictRequest, InspectRequest, InstallAdapter, InstallErrorCode, InstallEvent, InstallRequest, InstallResult, RemoteModelInfo, isInstallError } from '../installer/index.js'
import { RankProfile } from '../ranker/profiles.js'
import { planEviction } from './eviction.js'
import { PoolStateStore } from './state.js'
import { EmptyPoolState, EvictionPlan, PoolEntry, PoolState, PoolStateView } from './types.js'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
```
