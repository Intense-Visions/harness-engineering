---
schemaVersion: 1
module: 'packages/orchestrator/tests/workspace'
sourceHash: 'fb4ba21740e53d61cb26d645ba544e290163f9a2d430002a6cb5022accf941cb'
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
import '@harness-engineering/core'
import { HooksConfig, WorkflowConfig } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
