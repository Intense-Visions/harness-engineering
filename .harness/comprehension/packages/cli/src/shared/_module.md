---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: 'a8eee03b6c1ad648093891c5b8775cb3635a200bd0417201050ce8c30150bdc4'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'design-scan-targets.ts',
    'duplication-request.ts',
    'insights-entropy.ts',
    'state-events.ts',
    'verifier.ts',
  ]
---

## Interface Contract

```ts
export DESIGN_SCAN_EXTENSIONS
export ENTROPY_ISSUE_TYPES
export collectDesignScanFiles
export describeDuplicationNotRun
export describeUnknownIssueType
export designScanAbstention
export emitApprovalRequested
export emitApprovalResolved
export emitCoreEvent
export emitUserInputCaptured
export isEmptyHarnessState
export isEntropyIssueType
export isExcluded
export noFilesScannedError
export readAuditTimeline
export readHarnessState
export resolveDesignExcludePatterns
export resolveDuplicationRequest
export resolveInsightsEntropyGatherer
```

## Dependency Slice

```
import { runCleanup } from '../commands/cleanup'
import { loadAnalysisExclude, loadDesignExclude } from '../config/analysis-schema.js'
import { findConfigFile } from '../config/loader'
import { DuplicationConfig, HarnessState, InsightsEntropyGatherer, Ok, Result, eventSourcing } from '@harness-engineering/core'
import { minimatch } from 'minimatch'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as path from 'path'
```
