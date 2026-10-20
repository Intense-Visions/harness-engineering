---
schemaVersion: 1
module: 'packages/cli/tests/shared'
sourceHash: 'be1152c60a1a396f7d33049722bb6e108a9e54d2f3cab94f815cc19eeb645f32'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['duplication-request.test.ts', 'state-events.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ENTROPY_ISSUE_TYPES, describeDuplicationNotRun, describeUnknownIssueType, isEntropyIssueType, resolveDuplicationRequest } from '../../src/shared/duplication-request'
import { emitApprovalRequested, emitApprovalResolved, emitCoreEvent, emitUserInputCaptured, readAuditTimeline, readHarnessState } from '../../src/shared/state-events'
import { HarnessState, eventSourcing } from '@harness-engineering/core'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
