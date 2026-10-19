---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: 'a043d23db4214a3fe9828df5f08a20a268feef5d250d89f5f66e6dcf4f910a3a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['design-scan-targets.ts', 'state-events.ts', 'verifier.ts']
---

## Interface Contract

```ts
export DESIGN_SCAN_EXTENSIONS
export collectDesignScanFiles
export designScanAbstention
export emitApprovalRequested
export emitApprovalResolved
export emitCoreEvent
export emitUserInputCaptured
export isEmptyHarnessState
export noFilesScannedError
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
