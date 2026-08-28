---
schemaVersion: 1
module: 'packages/dashboard/tests/server'
sourceHash: '62646f0d5d29be8af65f72356f204ee471b060e80df5de0e75121ff1525c5e03'
compiledAt: '2026-08-28T01:22:11.502Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

`packages/dashboard/tests/server` validates five core server systems: **DataCache** (TTL-based value storage with expiration), **GatherCache** (one-shot async function execution with caching), **identity resolution** (multi-method fallback: GitHub API → gh-cli → git config), **error formatting** (extracting nested error causes from fetch failures), and **health check endpoint** (/api/health-check returning 200 + ok status). Identity results are cached; roles are read uncached from environment each call.

## Invariants

- DataCache TTL expiration is strict: entries must return null after TTL elapsed; entries within TTL remain valid
- GatherCache executes at most once per key per run() call; second calls return cached result without re-execution
- Identity resolution follows deterministic fallback chain (GitHub API → gh-cli → git config) with no reordering allowed
- resolveIdentity results must be cached across calls; clearIdentityCache must invalidate cache for re-resolution
- resolveRole must NOT cache and must re-read HARNESS_DASHBOARD_ROLE environment variable on every call
- formatProxyErrorMessage must prefer cause.message over cause.code when both are present
- Error cause extraction must handle Error objects, plain objects with .code property, and non-Error throwables without crashing
- GET /api/health-check must always return HTTP 200 with body { status: 'ok' }

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
