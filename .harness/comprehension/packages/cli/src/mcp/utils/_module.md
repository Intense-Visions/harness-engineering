---
schemaVersion: 1
module: 'packages/cli/src/mcp/utils'
sourceHash: 'da05de1a38352921aee22222c82727102a6ea9957cc5208fd0612fa5e24cef1e'
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
    'waypoint-emission.test.ts',
    'waypoint-emission.ts',
  ]
---

## Interface Contract

```ts
export SEVERITY_ORDER
export bigIntSafeReplacer
export clearGraphStoreCache
export emitAcceptanceVerdictEvent
export emitOutcomeVerdictEvent
export emitUatSignoffEvent
export globFiles
export isClaudeCliAvailable
export isCliAvailable
export loadGraphStore
export resolveAnalysisProvider
export resolveProjectConfig
export resolveProjectRootArg
export resolveProviderKind
export resultToMcpResponse
export sanitizePath
export sortFindingsBySeverity
export specSlug
```

## Dependency Slice

```
import { sanitizePath } from './sanitize-path'
import { emitAcceptanceVerdictEvent, emitOutcomeVerdictEvent, emitUatSignoffEvent, specSlug } from './waypoint-emission.js'
import { Err, Ok, Result, resetWaypointEmitterForTests } from '@harness-engineering/core'
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph'
import '@harness-engineering/intelligence'
import { SdlcEvent } from '@harness-engineering/types'
import * as fs from 'fs'
import { stat } from 'fs/promises'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path, { join } from 'node:path'
import * as path from 'node:path'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
