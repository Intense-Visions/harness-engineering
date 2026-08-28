---
schemaVersion: 1
module: 'packages/orchestrator/tests/workspace'
sourceHash: 'b9626a79ee819a039c367afdf66cdc699f41a41ac7ff2d2f3f35a0c7a5faf907'
compiledAt: '2026-08-28T01:22:12.759Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'baseref-fallback.test.ts',
    'config-scanner.test.ts',
    'derive-seed-paths.test.ts',
    'hooks.test.ts',
    'manager.identity.test.ts',
    'manager.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { deriveSeedPaths } from '../../src/orchestrator'
import { scanWorkspaceConfig } from '../../src/workspace/config-scanner'
import { WorkspaceHooks } from '../../src/workspace/hooks'
import { BaseRefFallbackEvent, WorkspaceManager } from '../../src/workspace/manager'
import from '@harness-engineering/core'
import { HooksConfig, WorkflowConfig } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
