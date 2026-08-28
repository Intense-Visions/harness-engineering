---
schemaVersion: 1
module: 'packages/orchestrator/tests/server/routes'
sourceHash: '4790cc3b0d72dfe42bf99daa34cb771397720688bbdcdfd78036a2277a1e9994'
compiledAt: '2026-08-28T01:22:12.722Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'chat-proxy.test.ts',
    'interactions.test.ts',
    'local-model.test.ts',
    'plans.test.ts',
    'roadmap-actions.conflict.test.ts',
    'roadmap-actions.file-based.test.ts',
    'roadmap-actions.file-less-stub.test.ts',
    'sessions.test.ts',
    'streams.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { InteractionQueue } from '../../../src/core/interaction-queue'
import { StreamManifest, StreamRecorder } from '../../../src/core/stream-recorder'
import { handleChatProxyRoute } from '../../../src/server/routes/chat-proxy'
import { handleInteractionsRoute } from '../../../src/server/routes/interactions'
import { handleLocalModelRoute, handleLocalModelsRoute } from '../../../src/server/routes/local-model'
import { handlePlansRoute } from '../../../src/server/routes/plans'
import { handleRoadmapActionsRoute } from '../../../src/server/routes/roadmap-actions'
import { handleSessionsRoute } from '../../../src/server/routes/sessions'
import { handleStreamsRoute } from '../../../src/server/routes/streams'
import { LocalModelStatus, NamedLocalModelStatus } from '@harness-engineering/types'
import * as child_process from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as http from 'node:http'
import { AddressInfo } from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
