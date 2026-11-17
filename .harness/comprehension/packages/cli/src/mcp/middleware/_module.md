---
schemaVersion: 1
module: 'packages/cli/src/mcp/middleware'
sourceHash: '04863f8a2ec41cbcd2eaf6c0264586d3c20809e2ced76a2e4635bc81e784b138'
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
