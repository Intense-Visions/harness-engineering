---
schemaVersion: 1
module: 'packages/cli/tests/commands/gateway'
sourceHash: '4ac7a4c43d509e8a00e713a9db0c3f4483e1a3cab3e1f63e6930e62ff65ecc73'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['deliveries-cov544b.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createDeliveriesCommand } from '../../../src/commands/gateway/deliveries'
import { MAX_ATTEMPTS, WebhookQueue } from '@harness-engineering/orchestrator'
import { Command } from 'commander'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
