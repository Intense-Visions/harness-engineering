---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: '1e35315fcf269e82a566b33e94a71c87f06fe8843bb3c62bfd958d53998d9d9b'
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
