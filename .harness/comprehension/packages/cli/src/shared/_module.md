---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: '8a84f299b5360057fe952d59c043534f9ca4bf4cad096e9ebb72ccfb5e44d260'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['design-scan-targets.ts', 'duplication-request.ts', 'state-events.ts', 'verifier.ts']
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
```

## Dependency Slice

```
import { loadAnalysisExclude, loadDesignExclude } from '../config/analysis-schema.js'
import { DuplicationConfig, HarnessState, Ok, Result, eventSourcing } from '@harness-engineering/core'
import { minimatch } from 'minimatch'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
