---
schemaVersion: 1
module: 'packages/dashboard/tests/server'
sourceHash: '62646f0d5d29be8af65f72356f204ee471b060e80df5de0e75121ff1525c5e03'
compiledAt: '2026-08-28T01:22:11.502Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'cache.test.ts',
    'gather-cache.test.ts',
    'health-check.test.ts',
    'identity-role.test.ts',
    'identity.test.ts',
    'orchestrator-proxy.test.ts',
    'serve-bind-host.test.ts',
    'sse-manager-checks.test.ts',
    'sse-manager.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DataCache } from '../../src/server/cache'
import { ServerContext } from '../../src/server/context'
import { GatherCache } from '../../src/server/gather-cache'
import from '../../src/server/gather/security'
import { clearIdentityCache, resolveIdentity, resolveRole } from '../../src/server/identity'
import { app } from '../../src/server/index'
import { formatProxyErrorMessage } from '../../src/server/orchestrator-proxy'
import { SSEManager } from '../../src/server/sse'
import { getBindHost } from '../../src/shared/constants'
import { execFile } from 'node:child_process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
