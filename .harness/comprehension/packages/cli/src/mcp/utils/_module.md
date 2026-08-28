---
schemaVersion: 1
module: 'packages/cli/src/mcp/utils'
sourceHash: '3702de6e9576975d9ddad577095cc3b971d16a81f9585b237824ade41f144e57'
compiledAt: '2026-08-28T01:22:09.285Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'analysis-provider.ts',
    'config-resolver.ts',
    'glob-helper.ts',
    'graph-loader.ts',
    'result-adapter.ts',
    'sanitize-path.test.ts',
    'sanitize-path.ts',
    'severity.ts',
  ]
---

## Interface Contract

```ts
export SEVERITY_ORDER
export bigIntSafeReplacer
export clearGraphStoreCache
export globFiles
export isClaudeCliAvailable
export loadGraphStore
export resolveAnalysisProvider
export resolveProjectConfig
export resultToMcpResponse
export sanitizePath
export sortFindingsBySeverity
```

## Dependency Slice

```
import { sanitizePath } from './sanitize-path'
import { Err, Ok, Result } from '@harness-engineering/core'
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph'
import from '@harness-engineering/intelligence'
import * as fs from 'fs'
import { stat } from 'fs/promises'
import { existsSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import * as path, path from 'node:path'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
```
