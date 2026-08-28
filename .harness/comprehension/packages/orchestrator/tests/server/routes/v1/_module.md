---
schemaVersion: 1
module: 'packages/orchestrator/tests/server/routes/v1'
sourceHash: '1f38cc9019bae1801a14e94cc196a1a95e0039399e2df979dc8dd6913a56f8a2'
compiledAt: '2026-08-28T01:22:12.725Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['local-models-pool-mutation.test.ts', 'local-models.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { requiredScopeForRoute } from '../../../../src/auth/scopes'
import { MODEL_INSTALL_TOPIC } from '../../../../src/proposals/model-handlers'
import { RefreshSchedulerOps, V1LocalModelsDeps, handleV1LocalModelsRoute } from '../../../../src/server/routes/v1/local-models'
import { V1LocalModelsMutationDeps, handleV1LocalModelsMutationRoute } from '../../../../src/server/routes/v1/local-models-pool-mutation'
import { V1_BRIDGE_ROUTES } from '../../../../src/server/v1-bridge-routes'
import { listProposals } from '@harness-engineering/core'
import { EmptyPoolState, EvictPoolRequest, EvictPoolResult, HardwareProfile, InstallPoolRequest, InstallPoolResult, PoolEntry, PoolState, PoolStateView, RankedModel, TickResult } from '@harness-engineering/local-models'
import { ModelInstallEvent, Proposal } from '@harness-engineering/types'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
