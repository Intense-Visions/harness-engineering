---
schemaVersion: 1
module: 'packages/cli/src/mcp/middleware'
sourceHash: '97c42675e3e98bbce894e77a193318815d04de497e2dc7af8764c6db978bfb15'
compiledAt: '2026-08-28T01:22:09.241Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['compaction.ts', 'context-budget.ts', 'injection-guard.ts']
---

## Interface Contract

```ts
export applyCompaction
export applyContextBudget
export applyInjectionGuard
export wrapWithCompaction
export wrapWithContextBudget
export wrapWithInjectionGuard
```

## Dependency Slice

```
import { CompactionPipeline, DEFAULT_TOKEN_BUDGET, DESTRUCTIVE_BASH, InjectionFinding, StructuralStrategy, TruncationStrategy, checkTaint, estimateTokens, evaluateSessionContextBudget, scanForInjection, spillIfNeeded, writeTaint } from '@harness-engineering/core'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
```
