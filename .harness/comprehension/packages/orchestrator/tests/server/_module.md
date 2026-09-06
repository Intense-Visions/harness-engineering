---
schemaVersion: 1
module: 'packages/orchestrator/tests/server'
sourceHash: '6d833574e143b31622e588965456a2aa0f131dfccb0cba253f2669cdd903e62e'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'bind-host.test.ts',
    'bind-port-hygiene.test.ts',
    'http.test.ts',
    'integration.test.ts',
    'lmlm-phase7-e2e.test.ts',
    'local-model-broadcast.test.ts',
    'plan-watcher.test.ts',
    'static.test.ts',
    'websocket.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { InteractionQueue } from '../../src/core/interaction-queue'
import { wireNotificationSinks } from '../../src/notifications/events'
import { SinkRegistry } from '../../src/notifications/registry'
import { ModelHandlerDeps, ModelPoolOps, onApproveModelProposal } from '../../src/proposals/model-handlers'
import { OrchestratorServer, getBindHost } from '../../src/server/http'
import { PlanWatcher } from '../../src/server/plan-watcher'
import { handleStaticFile } from '../../src/server/static'
import { WebSocketBroadcaster } from '../../src/server/websocket'
import { EvictRequest, InstallAdapter, InstallRequest, InstallResult, PoolEntry, PoolFilesystem, PoolManager, PoolState, PoolStateStore, TickResult } from '@harness-engineering/local-models'
import { LocalModelStatus, ModelProposalRecord, NamedLocalModelStatus, NotificationsConfig, Proposal } from '@harness-engineering/types'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as http from 'node:http'
import { AddressInfo } from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import { TestOptions, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
```
