---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: '58425e715434daa95d9e183b3791215f63e7aecfa00ab85752b799fdc48b5bb9'
compiledAt: '2026-08-28T01:22:09.338Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['state-events.ts', 'verifier.ts']
---

## Interface Contract

```ts
export emitApprovalRequested
export emitApprovalResolved
export emitCoreEvent
export emitUserInputCaptured
export isEmptyHarnessState
export readAuditTimeline
export readHarnessState
```

## Dependency Slice

```
import { HarnessState, Ok, Result, eventSourcing } from '@harness-engineering/core'
```
