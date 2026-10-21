---
schemaVersion: 1
module: 'packages/cli/tests/shared'
sourceHash: '66ac0ecc96ae6bbd02bdbbfd60658a022070c6d90f3f7d0384f1d785fd11ac9c'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['design-scan-targets.test.ts', 'duplication-request.test.ts', 'state-events.test.ts']
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
import { ENTROPY_ISSUE_TYPES, describeDuplicationNotRun, describeUnknownIssueType, isEntropyIssueType, resolveDuplicationRequest } from '../../src/shared/duplication-request'
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
