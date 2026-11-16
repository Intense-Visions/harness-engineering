---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: '920b0afb1e9ad86561d2933f2ea13f3301dd62be0376dcf4dded8ca42f59af76'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'design-scan-targets.ts',
    'duplication-baseline.ts',
    'duplication-request.ts',
    'entropy-scope.ts',
    'insights-entropy.ts',
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
export isDesignScanPath
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
export resolveInsightsEntropyGatherer
export writeDuplicationBaseline
```

## Dependency Slice

```
import { runCleanup } from '../commands/cleanup'
import { loadAnalysisExclude, loadDesignExclude } from '../config/analysis-schema.js'
import { findConfigFile } from '../config/loader'
import { HarnessConfig } from '../config/schema.js'
import { DuplicationConfig, HarnessState, InsightsEntropyGatherer, Ok, Result, eventSourcing } from '@harness-engineering/core'
import * as fs from 'fs'
import { minimatch } from 'minimatch'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as path from 'path'
```
