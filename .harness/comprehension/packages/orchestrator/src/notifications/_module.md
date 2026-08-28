---
schemaVersion: 1
module: "packages/orchestrator/src/notifications"
sourceHash: "9f0498d47dd79699d0ee9954bc4a5b58bce6e7bb8a71fc28f0c16e24191469d7"
compiledAt: "2026-08-28T01:22:12.308Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["envelope.test.ts", "envelope.ts", "events.test.ts", "events.ts", "index.ts", "registry.test.ts", "registry.ts", "sink.ts", "slack-sink.test.ts", "slack-sink.ts"]
---

## Summary

The `notifications` module is a pluggable event-delivery system that converts gateway events into structured notifications and routes them to configured sinks (currently Slack). It has three core responsibilities:

**Event → Envelope wrapping** (`envelope.ts`): Converts opaque `GatewayEvent` objects into `NotificationEnvelope` structs with semantic title, summary, and severity. Uses a per-event-type deriver pattern (maintenance, interaction, proposal, model-proposal) with heuristic fallbacks (type-suffix matching) for unknown events. Enforces title truncation (280 chars) and propagates correlationId for tracing.

**Sink registry & configuration** (`registry.ts`, `sink.ts`): Manages pluggable notification sinks via a `SinkRegistry`. Each sink is instantiated from config (currently only `SlackSink`), validated on startup, and can fail if misconfigured (throws `SinkConfigError`). Sinks must implement `deliver(envelope) → NotificationDeliveryResult`.

**Wiring & delivery** (`events.ts`, `index.ts`): Connects a `GatewayEvent` stream (from webhooks) to all registered sinks. The public entry point is `wireNotificationSinks(config)`, which stands up the entire notification pipeline in one call.

## Invariants

- Every GatewayEvent is wrappable — wrapAsEnvelope() must always return a valid NotificationEnvelope, even for unknown event types (falls back to generic info + JSON stringify of data).
- Envelope derivers are type-keyed, not event-time-keyed — the ENVELOPE_DERIVERS map is the single source of truth for semantic mapping; adding a new event type requires a new deriver entry.
- CorrelationId flows end-to-end — must be carried from GatewayEvent → NotificationEnvelope → sink delivery for request tracing; sinks must propagate it to downstream systems (e.g., Slack thread IDs).
- Title truncation is non-negotiable — max 280 chars enforced before sink delivery; prevents downstream systems (Slack, dashboards) from truncating mid-word or dropping the message.
- Severity is always set — either explicitly (per-event deriver) or heuristically (type-suffix matching: .error → error, .completed → success, else info); no envelope leaves without it.
- Sinks are immutable after init — registry is built at startup from config; no runtime sink addition/removal. Runtime failures in a sink do not poison the registry or prevent other sinks from delivering.
- SinkConfigError is the canonical validation path — any sink whose config is invalid on startup throws SinkConfigError with the config key; logs or upstream tooling must catch this to prevent silent failures.

## Interface Contract

```ts
export FromConfigOptions
export NotificationSink
export NotificationSinkDeliverInput
export RegistryEntry
export SinkConfigError
export SinkRegistry
export SlackSink
export SlackSinkOptions
export wireNotificationSinks
export wrapAsEnvelope
```

## Dependency Slice

```
import { eventMatches } from '../gateway/webhooks/signer.js'
import { wrapAsEnvelope } from './envelope'
import { wrapAsEnvelope } from './envelope.js'
import { wireNotificationSinks } from './events'
import { SinkConfigError, SinkRegistry } from './registry'
import { SinkRegistry } from './registry.js'
import { NotificationSink, NotificationSinkDeliverInput } from './sink.js'
import { SlackSink } from './slack-sink'
import { SlackSink } from './slack-sink.js'
import { GatewayEvent, NotificationDeliveryResult, NotificationEnvelope, NotificationSeverity, NotificationSinkConfig, NotificationSinkKind, NotificationsConfig } from '@harness-engineering/types'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
```
