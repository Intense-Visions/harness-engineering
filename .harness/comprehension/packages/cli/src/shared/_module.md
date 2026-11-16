---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: 'a9fac36b42967bb4c51f2749d3e1627243eb11d1b5c879fa3b70ddf5e3c927e9'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'design-scan-targets.ts',
    'duplication-request.ts',
    'entropy-scope.ts',
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
export docsDirGlob
export emitApprovalRequested
export emitApprovalResolved
export emitCoreEvent
export emitUserInputCaptured
export isDesignScanPath
export isEmptyHarnessState
export isEntropyIssueType
export isExcluded
export noFilesScannedError
export readAuditTimeline
export readHarnessState
export resolveDesignExcludePatterns
export resolveDuplicationRequest
export resolveEntropyScope
```

## Dependency Slice

```
import { loadAnalysisExclude, loadDesignExclude } from '../config/analysis-schema.js'
import { HarnessConfig } from '../config/schema.js'
import { DuplicationConfig, HarnessState, Ok, Result, eventSourcing } from '@harness-engineering/core'
import { minimatch } from 'minimatch'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as path from 'path'
```
