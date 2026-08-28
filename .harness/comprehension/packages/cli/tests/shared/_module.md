---
schemaVersion: 1
module: 'packages/cli/tests/shared'
sourceHash: 'b68c6de858559e8291e3e716fa82350c7604da90b0414fe29b665f9492e7b948'
compiledAt: '2026-08-28T01:22:09.950Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['state-events.test.ts']
---

## Summary

The `packages/cli/tests/shared` test suite validates the state-events facade, which bridges legacy `.harness/state.json` files with event-sourced audit logs. The module tests four concerns: **(1)** reading legacy state without loss, **(2)** appending new decisions via `emitCoreEvent` while preserving history, **(3)** returning Result types consistently, and **(4)** recovering audit trails (user input, approvals) through the event-sourcing layer. Tests exercise both happy paths (legacy→read→emit→verify) and zero-state fallbacks (missing files yield empty defaults).

## Invariants

- Legacy preservation contract: emitCoreEvent must union new decisions onto existing ones; legacy decisions found in the initial read must still appear after emit. Dropping them breaks replay.
- Result type discipline: All read operations (readHarnessState, readAuditTimeline) return Result<T> with .ok boolean and .value shape. Callers pattern-match on .ok before dereferencing .value.
- Empty-project ergonomics: Missing .harness/state.json or empty audit logs must not error; they produce sensible defaults (empty decisions array, empty timeline string). Non-existent is not an error state.
- Audit trail fidelity: Events written via emitUserInputCaptured / emitApprovalRequested / emitApprovalResolved must be recoverable via eventSourcing.loadEvents + projectAudit + readAuditTimeline in emission order without loss or reordering.
- Transitive recovery: A round-trip (read legacy → emit new event → read again) must preserve all state; decisions, blockers, and progress from the original file coexist with new emitted events.

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
