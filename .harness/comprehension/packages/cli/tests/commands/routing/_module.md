---
schemaVersion: 1
module: 'packages/cli/tests/commands/routing'
sourceHash: '3bc8a54829eefb2618a41f73aee4edf33ae987d8e78460a90fa364c6b78ced9a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['config-cov544b.test.ts', 'decisions-cov544b.test.ts', 'failure.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createConfigCommand } from '../../../src/commands/routing/config'
import { createDecisionsCommand } from '../../../src/commands/routing/decisions'
import { failRoutingCall, routingFailureMessage } from '../../../src/commands/routing/failure'
import { logger } from '../../../src/output/logger'
import { Command } from 'commander'
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
