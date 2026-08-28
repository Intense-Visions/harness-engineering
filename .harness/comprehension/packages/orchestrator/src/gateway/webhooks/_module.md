---
schemaVersion: 1
module: "packages/orchestrator/src/gateway/webhooks"
sourceHash: "998f0fcbbf0e253a0e563e33e2bbbda7d9ede13ee4d34e217a6f58fb9f992941"
compiledAt: "2026-08-28T01:22:12.239Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["delivery.test.ts", "delivery.ts", "events.test.ts", "events.ts", "queue.test.ts", "queue.ts", "signer.test.ts", "signer.ts", "store.test.ts", "store.ts"]
---

## Summary

The webhooks gateway module implements outbound event delivery for the orchestrator. It separates concerns across WebhookStore (subscription persistence), WebhookQueue (SQLite-backed delivery queue), and WebhookDelivery (event-driven worker). When events fire, matching subscriptions enqueue delivery tasks; the worker polls the queue on a tick interval, signs payloads with HMAC-SHA256, POSTs to subscribed URLs, and tracks delivery status. Failed attempts escalate to dead-letter status after MAX_ATTEMPTS. The module hardens against SSRF by validating host literals and DNS resolution at registration and again at delivery time, refusing redirect following, and escalating deleted subscriptions to dead-letter. Graceful shutdown drains in-flight work or aborts after timeout, leaving rows in_flight for recovery on restart.

## Invariants

- Signature integrity: every delivery includes x-harness-signature: sha256=<hex> computed via the shared subscription token; subscribers verify before accepting
- Delivery idempotency: each row gets a unique dlv_* ID and is marked delivered before yielding; retries carry the same ID for deduplication
- Private-host double-check: route-level validation at registration + delivery-time re-validation (literal URL + DNS resolution) catch both malicious and corrupted subscriptions
- No redirect following: delivery enforces redirect-refuse (3xx → dead letter) to prevent SSRF bypass via injected Location headers
- Dead-letter on missing subscription: if a subscription is deleted after enqueue, the row transitions to dead with subscription deleted error rather than retry
- Concurrency cap per subscription: maxConcurrentPerSub (default 1) ensures a misbehaving endpoint cannot starve other subscriptions
- Graceful drain: stop() waits up to drainTimeoutMs for in-flight POSTs; rows aborted mid-delivery stay in_flight so recovery logic recoverInFlight re-queues them on restart

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
