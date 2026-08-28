---
schemaVersion: 1
module: 'packages/cli/src/commands/notifications'
sourceHash: 'a69afb7ac89584f799729d53bc79d2b00c860ac0a36ced5a6623f6ebc6bb0e95'
compiledAt: '2026-08-28T01:22:08.849Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'test.ts']
---

## Interface Contract

```ts
export createNotificationsCommand
export runNotificationsTest
```

## Dependency Slice

```
import { logger } from '../../output/logger'
import { ExitCode } from '../../utils/errors'
import { createNotificationsTestSubcommand } from './test'
import { loadNotificationsConfig } from '@harness-engineering/core'
import { SinkConfigError, SinkRegistry, wrapAsEnvelope } from '@harness-engineering/orchestrator'
import { GatewayEvent } from '@harness-engineering/types'
import { Command } from 'commander'
import { randomBytes } from 'node:crypto'
import { resolve } from 'node:path'
```
