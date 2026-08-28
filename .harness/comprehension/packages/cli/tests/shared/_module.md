---
schemaVersion: 1
module: 'packages/cli/tests/shared'
sourceHash: 'b68c6de858559e8291e3e716fa82350c7604da90b0414fe29b665f9492e7b948'
compiledAt: '2026-08-28T01:22:09.950Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['state-events.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { emitApprovalRequested, emitApprovalResolved, emitCoreEvent, emitUserInputCaptured, readAuditTimeline, readHarnessState } from '../../src/shared/state-events'
import { HarnessState, eventSourcing } from '@harness-engineering/core'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
