---
schemaVersion: 1
module: 'packages/orchestrator/src/gateway/webhooks'
sourceHash: '998f0fcbbf0e253a0e563e33e2bbbda7d9ede13ee4d34e217a6f58fb9f992941'
compiledAt: '2026-08-28T01:22:12.239Z'
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
import { GatewayEvent, WebhookSubscription, WebhookSubscriptionSchema } from '@harness-engineering/types'
import Database from 'better-sqlite3'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import http from 'node:http'
import { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
