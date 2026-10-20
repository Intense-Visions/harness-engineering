---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: '08a57bdde95f2048aa8c81cde5e63c7a1771cbd65d880179ba79493afec8dfa7'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['duplication-request.ts', 'state-events.ts', 'verifier.ts']
---

## Interface Contract

```ts
export describeDuplicationNotRun
export emitApprovalRequested
export emitApprovalResolved
export emitCoreEvent
export emitUserInputCaptured
export isEmptyHarnessState
export readAuditTimeline
export readHarnessState
export resolveDuplicationRequest
```

## Dependency Slice

```
import { DuplicationConfig, HarnessState, Ok, Result, eventSourcing } from '@harness-engineering/core'
```
