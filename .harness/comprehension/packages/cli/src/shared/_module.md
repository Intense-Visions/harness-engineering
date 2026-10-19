---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: '7975a590523a5e0b50de6d53e9d9db9347759b56d3dbe0ba05efb4dc0219de5a'
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
