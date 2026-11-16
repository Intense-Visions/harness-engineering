---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: '7b8af9ba2652d245aedb6c04223c1d30333781b79e7615d627f9fcdb3a73e8b8'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'design-scan-targets.ts',
    'duplication-baseline.ts',
    'duplication-request.ts',
    'entropy-scope.ts',
    'state-events.ts',
    'verifier.ts',
  ]
---

## Interface Contract

```ts
export DESIGN_SCAN_EXTENSIONS
export DUPLICATION_BASELINE_PATH
export ENTROPY_ISSUE_TYPES
export UPDATE_BASELINE_WITHOUT_SCAN
export baselineDeltaForReport
export buildDuplicationBaseline
export classIdentity
export collectDesignScanFiles
export compareDuplicationBaseline
export describeDuplicationNotRun
export describeUnknownIssueType
export designScanAbstention
export docsDirGlob
export duplicationBaselineDelta
export emitApprovalRequested
export emitApprovalResolved
export emitCoreEvent
export emitUserInputCaptured
export formatDuplicationBaselineLine
export isEmptyHarnessState
export isEntropyIssueType
export isExcluded
export noFilesScannedError
export readAuditTimeline
export readDuplicationBaseline
export readHarnessState
export recordOrCompareBaseline
export resolveDesignExcludePatterns
export resolveDuplicationRequest
export resolveEntropyScope
export writeDuplicationBaseline
```

## Dependency Slice

```
import { loadAnalysisExclude, loadDesignExclude } from '../config/analysis-schema.js'
import { HarnessConfig } from '../config/schema.js'
import { DuplicationConfig, HarnessState, Ok, Result, eventSourcing } from '@harness-engineering/core'
import * as fs from 'fs'
import { minimatch } from 'minimatch'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as path from 'path'
```
