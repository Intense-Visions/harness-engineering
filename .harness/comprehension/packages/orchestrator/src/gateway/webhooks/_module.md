---
schemaVersion: 1
module: 'packages/orchestrator/src/gateway/webhooks'
sourceHash: '9237d4931c236454e9efb9dffd6b7b7331c70dbce7d708c0505090b9ba328600'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'delivery.test.ts',
    'delivery.ts',
    'events.test.ts',
    'events.ts',
    'queue.test.ts',
    'queue.ts',
    'signer.test.ts',
    'signer.ts',
    'store.test.ts',
    'store.ts',
    'waypoint-bridge.test.ts',
    'waypoint-bridge.ts',
  ]
---

## Interface Contract

```ts
export MAX_ATTEMPTS
export RETRY_DELAYS_MS
export WebhookDelivery
export WebhookQueue
export WebhookStore
export eventMatches
export sign
export verify
export wireWaypointSdlcBridge
export wireWebhookFanout
```

## Dependency Slice

```
import { HostLookup, guardOutboundHost } from '../../server/utils/url-guard.js'
import { WebhookDelivery } from './delivery'
import { wireWebhookFanout } from './events'
import { MAX_ATTEMPTS, RETRY_DELAYS_MS, WebhookQueue } from './queue'
import { MAX_ATTEMPTS, QueueRow, RETRY_DELAYS_MS, WebhookQueue } from './queue.js'
import { eventMatches, sign, verify } from './signer'
import { sign } from './signer.js'
import { WebhookStore } from './store'
import { WebhookStore } from './store.js'
import { wireWaypointSdlcBridge } from './waypoint-bridge'
import { emitSdlc, ensureWaypointEmitter, resetWaypointEmitterForTests } from '@harness-engineering/core'
import { GatewayEvent, SDLC_EVENT_TYPES_V1, WebhookSubscription, WebhookSubscriptionSchema } from '@harness-engineering/types'
import Database from 'better-sqlite3'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
