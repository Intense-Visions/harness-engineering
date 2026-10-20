---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: 'cf0b07c37cbc15ac0229af2c5ff5e0bcd8c211113a8d85e4bc6c2ed5cac08480'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['duplication-request.ts', 'state-events.ts', 'verifier.ts']
---

## Interface Contract

```ts
export ENTROPY_ISSUE_TYPES
export describeDuplicationNotRun
export describeUnknownIssueType
export emitApprovalRequested
export emitApprovalResolved
export emitCoreEvent
export emitUserInputCaptured
export isEmptyHarnessState
export isEntropyIssueType
export readAuditTimeline
export readHarnessState
export resolveDuplicationRequest
```

## Dependency Slice

```
import { DuplicationConfig, HarnessState, Ok, Result, eventSourcing } from '@harness-engineering/core'
```
