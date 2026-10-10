---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: '8050be374fa4385cb4be03c81a929be683d21dcfc33b3a578166d266d136fd05'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['design-scan-targets.ts', 'state-events.ts', 'verifier.ts']
---

## Interface Contract

```ts
export DESIGN_SCAN_EXTENSIONS
export collectDesignScanFiles
export emitApprovalRequested
export emitApprovalResolved
export emitCoreEvent
export emitUserInputCaptured
export isEmptyHarnessState
export readAuditTimeline
export readHarnessState
export resolveDesignExcludePatterns
```

## Dependency Slice

```
import { loadAnalysisExclude, loadDesignExclude } from '../config/analysis-schema.js'
import { HarnessState, Ok, Result, eventSourcing } from '@harness-engineering/core'
import { minimatch } from 'minimatch'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
