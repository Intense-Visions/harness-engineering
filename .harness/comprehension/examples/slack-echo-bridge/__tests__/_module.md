---
schemaVersion: 1
module: 'examples/slack-echo-bridge/__tests__'
sourceHash: 'add282a2ac9bdfffa1ff3c7b601f4ee98c279a11a8f5ceb09badac364ecb8dbb'
compiledAt: '2026-08-28T01:22:08.615Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['fixtures.ts', 'signer.test.ts', 'webhook-handler.test.ts']
---

## Interface Contract

```ts
export TEST_SECRET
export makeMaintenanceCompletedEvent
export signBody
```

## Dependency Slice

```
import { verify } from '../src/signer.js'
import { SlackPoster } from '../src/slack-client.js'
import { GatewayEvent, MaintenanceCompletedData } from '../src/types.js'
import { createWebhookServer, installShutdownHandlers } from '../src/webhook-handler.js'
import { TEST_SECRET, makeMaintenanceCompletedEvent, signBody } from './fixtures.js'
import { createHmac } from 'node:crypto'
import { Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
