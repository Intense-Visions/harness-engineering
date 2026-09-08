---
schemaVersion: 1
module: 'packages/cli/tests/commands/telemetry'
sourceHash: '3f012865bad00fff84d71035dc16725920fe3937ddb7cab4384ba1629e29e0dd'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['status-cov544b.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createStatusCommand } from '../../../src/commands/telemetry/status'
import { logger } from '../../../src/output/logger'
import { Command } from 'commander'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
