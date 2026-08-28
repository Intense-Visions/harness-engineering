---
schemaVersion: 1
module: 'packages/cli/src/commands/gateway'
sourceHash: '0caac9ecbe70929ea3de226328b419be95f796f5d859eca93f70f96cc4fab409'
compiledAt: '2026-08-28T01:22:08.816Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['deliveries.test.ts', 'deliveries.ts', 'index.ts', 'token.test.ts', 'token.ts']
---

## Interface Contract

```ts
export createGatewayCommand
```

## Dependency Slice

```
import { createDeliveriesCommand, runDeliveriesList, runDeliveriesPurge, runDeliveriesRetry } from './deliveries'
import { createTokenCommand, runTokenCreate, runTokenList, runTokenRevoke } from './token'
import { MAX_ATTEMPTS, QueueRow, TokenStore, WebhookQueue } from '@harness-engineering/orchestrator'
import { TokenScope } from '@harness-engineering/types'
import { Command } from 'commander'
import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
