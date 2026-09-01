---
schemaVersion: 1
module: 'packages/cli/src/mcp/middleware'
sourceHash: '1e573924b76e5a34085473c5877937fb6aeedc55f53c8eade61147f6a2d26080'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['compaction.ts', 'context-budget.ts', 'injection-guard.ts', 'version-guard.ts']
---

## Interface Contract

```ts
export applyCompaction
export applyContextBudget
export applyInjectionGuard
export applyVersionGuard
export wrapWithCompaction
export wrapWithContextBudget
export wrapWithInjectionGuard
export wrapWithVersionGuard
```

## Dependency Slice

```
import { envEnabled } from '../../utils/env-flag.js'
import { GUARDED_MCP_TOOLS, evaluateVersionGuard, findProjectRoot, resolveExpectedVersion } from '../../utils/version-guard.js'
import { CLI_VERSION } from '../../version.js'
import { CompactionPipeline, DEFAULT_TOKEN_BUDGET, DESTRUCTIVE_BASH, InjectionFinding, StructuralStrategy, TruncationStrategy, checkTaint, estimateTokens, evaluateSessionContextBudget, scanForInjection, spillIfNeeded, writeTaint } from '@harness-engineering/core'
import { realpathSync } from 'node:fs'
import { resolve } from 'node:path'
```
