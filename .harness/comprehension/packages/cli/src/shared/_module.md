---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: '90ced01d0e01fa7e41cb4c43191678c4042c7b91fa493df3a68f1a3f06c65eda'
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
