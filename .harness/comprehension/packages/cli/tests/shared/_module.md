---
schemaVersion: 1
module: 'packages/cli/tests/shared'
sourceHash: 'bdfa19e89fe99b6b0fd804d5b79637792eebebad1b572189ba6e423a8964ea4d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'design-scan-targets.test.ts',
    'duplication-baseline.test.ts',
    'duplication-request.test.ts',
    'entropy-scope.test.ts',
    'state-events.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runAuditBrand } from '../../src/brand'
import { runDetectDrift } from '../../src/drift'
import { runAudit } from '../../src/mcp/tools/audit-anatomy'
import { DESIGN_SCAN_EXTENSIONS, collectDesignScanFiles, isExcluded, resolveDesignExcludePatterns } from '../../src/shared/design-scan-targets'
import { buildDuplicationBaseline, compareDuplicationBaseline, formatDuplicationBaselineLine } from '../../src/shared/duplication-baseline'
import { ENTROPY_ISSUE_TYPES, describeDuplicationNotRun, describeUnknownIssueType, isEntropyIssueType, resolveDuplicationRequest } from '../../src/shared/duplication-request'
import { docsDirGlob } from '../../src/shared/entropy-scope'
import { emitApprovalRequested, emitApprovalResolved, emitCoreEvent, emitUserInputCaptured, readAuditTimeline, readHarnessState } from '../../src/shared/state-events'
import { HarnessState, eventSourcing } from '@harness-engineering/core'
import * as fs from 'fs'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
