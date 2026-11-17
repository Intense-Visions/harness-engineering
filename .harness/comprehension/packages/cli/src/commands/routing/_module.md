---
schemaVersion: 1
module: 'packages/cli/src/commands/routing'
sourceHash: '5f9560459814e38e265b49f47f33d29e4af5b36a14d1af76b7dc5ffb0ff6f073'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'config.ts',
    'decisions.ts',
    'failure.ts',
    'http-client.test.ts',
    'http-client.ts',
    'index.ts',
    'routing.test.ts',
    'status.ts',
    'telemetry.ts',
    'trace.ts',
  ]
---

## Interface Contract

```ts
export createRoutingCommand
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { ExitCode } from '../../utils/errors'
import { createConfigCommand } from './config'
import { createDecisionsCommand } from './decisions'
import { failRoutingCall, routingFailureMessage } from './failure'
import { authHeader, getJson, orchestratorBase, postJson } from './http-client'
import { createStatusCommand } from './status'
import { createTelemetryCommand } from './telemetry'
import { createTraceCommand } from './trace'
import { CapabilityTier, RoutingDecision, RoutingStatus, RoutingTelemetry, RoutingUseCase } from '@harness-engineering/types'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
