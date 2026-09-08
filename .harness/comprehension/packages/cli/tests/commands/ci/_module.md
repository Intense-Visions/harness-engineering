---
schemaVersion: 1
module: 'packages/cli/tests/commands/ci'
sourceHash: '91d6987f854adc7d850f9c7da207775fce3a4ab3e93e6d3c5232ac1eedd1c030'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['init-cov544b.test.ts', 'notify-cov544.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createInitCommand, generateCIConfig } from '../../../src/commands/ci/init'
import { createNotifyCommand } from '../../../src/commands/ci/notify'
import { logger } from '../../../src/output/logger'
import { Command } from 'commander'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
