---
schemaVersion: 1
module: 'packages/cli/tests/mcp/middleware'
sourceHash: 'da1a24b74fe7d101c62b3058334337e68946291f40559524278ae25113d8dad0'
compiledAt: '2026-08-28T01:22:09.771Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['compaction.test.ts', 'context-budget.test.ts', 'injection-guard.test.ts']
---

## Summary

The `packages/cli/tests/mcp/middleware` module tests three composable middleware layers guarding MCP tool responses: **Compaction** shrinks large JSON payloads by removing null/empty values and truncating to a 4000-token budget, with disk-spill for oversized content via locators; **Context Budget** appends warnings when responses exceed a configured token threshold (non-blocking, from `harness.config.json`); and **Injection Guard** detects prompt injection patterns in input/output and blocks destructive commands (git push/commit, rm -rf, writes outside workspace) during tainted sessions. All three enforce strict fail-open semantics—middleware errors never break tool execution.

## Invariants

- Fail-open gates all stages: handler errors propagate unchanged; compaction/budget/injection errors return raw output without modification
- compact:false and unconfigured budgets are byte-identical no-ops: must return exact handler output unmodified
- Single transformation pass per response: compaction adds one packed header to first text item only; context-budget appends one notice; injection-guard taints but doesn't mutate output
- Spill locators are session-durable: over-threshold responses write to disk and return harness-spill:<hash> locator; later turns reconstruct full payload via readSpill() without re-invoking
- The compact tool exemption: responses from compaction tool itself pass through unmodified (no double-packing)
- Taint taints, doesn't block retroactively: injection detected in input/output writes session-taint file; destructive commands are blocked during tainted session, not before
- Error responses (isError:true) are still compacted: compression preserves critical error fields but applies structural cleanup
- Reduction guarantees: compaction achieves ≥20% token reduction on structured JSON responses (>100 items) via structural pass + truncation

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
