---
schemaVersion: 1
module: 'packages/orchestrator/src/notifications'
sourceHash: '9f0498d47dd79699d0ee9954bc4a5b58bce6e7bb8a71fc28f0c16e24191469d7'
compiledAt: '2026-08-28T01:22:12.308Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'envelope.test.ts',
    'envelope.ts',
    'events.test.ts',
    'events.ts',
    'index.ts',
    'registry.test.ts',
    'registry.ts',
    'sink.ts',
    'slack-sink.test.ts',
    'slack-sink.ts',
  ]
---

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
