---
schemaVersion: 1
module: 'packages/cli/src/shared'
sourceHash: '58425e715434daa95d9e183b3791215f63e7aecfa00ab85752b799fdc48b5bb9'
compiledAt: '2026-08-28T01:22:09.338Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['state-events.ts', 'verifier.ts']
---

## Summary

`packages/cli/src/shared` is the authoritative compose point for event-sourced harness state read/write and audit trails. It wraps core's `eventSourcing` primitives and provides two critical workflows:

**State management**: Read path (legacy import → snapshot → HarnessState projection, idempotent) and write path (legacy import first, then emit event) ensure transparent transition from file-based to event-sourced state. The `isEmptyHarnessState` predicate replaces file-existence checks post-retirement.

**Audit trail**: Three emit helpers (`emitUserInputCaptured`, `emitApprovalRequested`, `emitApprovalResolved`) and `readAuditTimeline` subsume the legacy skill-event log (retired Phase 5, GH-580).

**Verifier interface**: Generic `Verifier<F, Cat, Meta>` contract for check-design composition using structural typing — new verifiers declare conformance via type alias without reshaping existing ones.

Both MCP tools and CLI import these helpers so state genesis, read, and write compose in exactly one place.

## Invariants

- Genesis import is mandatory and idempotent: every read/write calls importLegacyState first (memoized) to transparently migrate legacy state before appending; calling it repeatedly is safe.
- Single canonical read/write path: all state access routes through readHarnessState/emitCoreEvent to prevent divergent compose points across MCP tools and CLI.
- HarnessState emptiness is structural: a state is empty iff decisions, blockers, progress, phase, task, and lastSession are all absent — replaces file-existence checks post-retirement.
- Verifier composition is structural, not nominal: verifiers satisfy Verifier<F, Cat, Meta> via type aliases; no explicit interface implementation needed, allowing new verifiers to join without reshaping existing ones.
- Event types and audit payload shapes are strongly typed: EventInput from core enforces valid audit events; payloads (text, interactionId, kind, prompt, response) are part of the contract.
- Scope (stream/session) is orthogonal and optional: all operations support optional scoping to enable multi-stream audit trails without branching core logic.

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
