---
schemaVersion: 1
module: 'packages/orchestrator/src/gateway/telemetry'
sourceHash: 'b8c73504f71a1b5fb4517cb090dd3ef759a28943770d6b5d3de48c1c11940f20'
compiledAt: '2026-08-28T01:22:12.184Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['fanout.test.ts', 'fanout.ts']
---

## Interface Contract

```ts
export ActiveRunRegistry
export MAX_ACTIVE_RUNS
export wireTelemetryFanout
```

## Dependency Slice

```
import { WebhookDelivery } from '../webhooks/delivery'
import { eventMatches } from '../webhooks/signer'
import { WebhookStore } from '../webhooks/store'
import { ActiveRunRegistry, MAX_ACTIVE_RUNS, wireTelemetryFanout } from './fanout'
import { OTLPExporter, SpanKind, TraceSpan } from '@harness-engineering/core'
import { GatewayEvent, WebhookSubscription } from '@harness-engineering/types'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
```
