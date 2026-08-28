---
schemaVersion: 1
module: 'packages/cli/src/commands/routing'
sourceHash: 'aa87bf5d4e0d7b789753cbcc23be858482d58bc8da9256e15b3dd1dcabc19e4b'
compiledAt: '2026-08-28T01:22:08.868Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'config.ts',
    'decisions.ts',
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
import { authHeader, getJson, orchestratorBase, postJson } from './http-client'
import { createStatusCommand } from './status'
import { createTelemetryCommand } from './telemetry'
import { createTraceCommand } from './trace'
import { CapabilityTier, RoutingDecision, RoutingStatus, RoutingTelemetry, RoutingUseCase } from '@harness-engineering/types'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
