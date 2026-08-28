---
schemaVersion: 1
module: 'packages/cli/tests/mcp/middleware'
sourceHash: 'da1a24b74fe7d101c62b3058334337e68946291f40559524278ae25113d8dad0'
compiledAt: '2026-08-28T01:22:09.771Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['compaction.test.ts', 'context-budget.test.ts', 'injection-guard.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { applyCompaction, wrapWithCompaction } from '../../../src/mcp/middleware/compaction'
import { applyContextBudget, wrapWithContextBudget } from '../../../src/mcp/middleware/context-budget'
import { applyInjectionGuard, wrapWithInjectionGuard } from '../../../src/mcp/middleware/injection-guard'
import { createHarnessServer } from '../../../src/mcp/server'
import { SPILL_LOCATOR_SCHEME, readSpill, searchSpill, writeTaint } from '@harness-engineering/core'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
