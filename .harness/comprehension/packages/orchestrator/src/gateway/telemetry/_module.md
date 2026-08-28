---
schemaVersion: 1
module: "packages/orchestrator/src/gateway/telemetry"
sourceHash: "b8c73504f71a1b5fb4517cb090dd3ef759a28943770d6b5d3de48c1c11940f20"
compiledAt: "2026-08-28T01:22:12.184Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["fanout.test.ts", "fanout.ts"]
---

## Summary

The `telemetry` module bridges orchestrator lifecycle events into OpenTelemetry spans and webhook events. It listens to four event types (`maintenance:started`, `maintenance:completed`, `skill_invocation`, `dispatch:decision`) and emits a trace span + webhook event for each. The core challenge is trace correlation: child events must inherit trace context from their parent `maintenance:started` event via an in-memory `ActiveRunRegistry` keyed by `taskId` or `correlationId`. When a child event's keys don't match any open run, it becomes a root span rather than falling back to "latest open," preventing orphan events from being misattributed to unrelated traces. Webhook fanout respects the `telemetry.*` exclusion from wildcard subscriptions: only subscriptions explicitly naming `telemetry.*` or specific telemetry topics receive these events.

## Invariants

- Registry is bounded at MAX_ACTIVE_RUNS and evicts the oldest entry on overflow; prevents unbounded memory leaks if maintenance:completed events are dropped.
- Child event lookups never fall back to 'latest open'—resolve() returns undefined on taskId/correlationId miss, forcing orphan events to become root spans (new traceId, no parentSpanId), avoiding zombie correlation.
- Telemetry events are opt-in to webhooks: subscriptions on *.* do NOT match telemetry.* events; only explicit telemetry.* or specific topic subscriptions receive them.
- Child events inherit parent trace context: same traceId, own spanId, and parentSpanId pointing to parent's spanId.
- Unsubscribe fully removes all event listeners from the bus (one per topic); subsequent events are no-ops, verifiable via bus.listenerCount().
- One span per event: each emitted event produces exactly one TraceSpan pushed to the exporter with no batching or suppression.

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
