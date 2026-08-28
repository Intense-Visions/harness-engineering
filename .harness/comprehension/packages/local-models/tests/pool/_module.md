---
schemaVersion: 1
module: 'packages/local-models/tests/pool'
sourceHash: 'c1062c078a4065dd25583dfa124eeee1dae44c786eb67d5aa5be42e6debcc63b'
compiledAt: '2026-08-28T01:22:12.042Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['eviction.test.ts', 'manager.test.ts', 'provider.test.ts', 'state.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { AdvisoryInstallAdapter, EvictRequest, InspectRequest, InstallAdapter, InstallError, InstallRequest, InstallResult, ListRequest, RemoteModelInfo } from '../../src/installer/index.js'
import { planEviction, sortByEvictionOrder } from '../../src/pool/eviction.js'
import { PoolManager } from '../../src/pool/manager.js'
import { PoolStateProvider, poolStateToCandidates } from '../../src/pool/provider.js'
import { PoolFilesystem, PoolStateStore } from '../../src/pool/state.js'
import { EmptyPoolState, PoolEntry, PoolState } from '../../src/pool/types.js'
import { beforeEach, describe, expect, it } from 'vitest'
```
