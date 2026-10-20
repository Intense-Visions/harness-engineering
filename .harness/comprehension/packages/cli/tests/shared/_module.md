---
schemaVersion: 1
module: 'packages/cli/tests/shared'
sourceHash: 'f9a677f03838943d5ec4dbbf3d5e2da5415ac1288feea6e3f37ca8d0de9344c7'
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
import { describeDuplicationNotRun, resolveDuplicationRequest } from '../../src/shared/duplication-request'
import { emitApprovalRequested, emitApprovalResolved, emitCoreEvent, emitUserInputCaptured, readAuditTimeline, readHarnessState } from '../../src/shared/state-events'
import { HarnessState, eventSourcing } from '@harness-engineering/core'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
