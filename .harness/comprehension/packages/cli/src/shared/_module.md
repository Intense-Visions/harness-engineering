---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: '4d5679fde397c2b98dc7ab1562adf73ac22a7f6c72834164090e7043b59640cb'
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
