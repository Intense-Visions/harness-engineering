---
schemaVersion: 1
module: "packages/orchestrator/tests/proposals"
sourceHash: "3360d3d5d23546303899d84d944e057a66e3645bbd172d04e5af6f93f9e7b7c0"
compiledAt: "2026-08-28T01:22:12.621Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["events.test.ts", "gate.test.ts", "model-handlers.test.ts", "promote.test.ts"]
---

## Summary

The `packages/orchestrator/tests/proposals` module validates the full proposal lifecycle for skills and models. It spans four subsystems: event emission (validated shape on state transitions), gate validation (YAML/markdown checks, diff validation, re-run guardrails), model proposal handlers (install/evict orchestration, stale-target cancellation, in-use deferral, atomicity preservation, restart recovery), and promotion (writing artifacts with provenance, conflict detection). The tests use temporary directories, fake pool implementations, and deterministic harnesses to verify both happy paths and failure recovery flows.

## Invariants

- Event shape contract: every proposal state transition (created/approved/rejected) must emit a deterministic event with specific fields; downstream webhook subscribers depend on this shape.
- Gate is prerequisite: promotion requires gate to have run, passed with no errors, and be <24h old. Re-running a gate on an approved proposal throws GateRunError.
- Status state machine: open → gate-running → (gate-failed | gate-running) → (open | installing | error-*) → approved. The installing status is transient for idempotent restart recovery.
- Model eviction deferral (S1): when a model to be evicted is in-use, evict must be deferred via pendingEviction flag, not executed immediately. The proposal still approves.
- Swap atomicity truthfulness: if install succeeds but evict fails, proposal must revert to open (retryable), never to approved. Pool events must reflect actual state without phantom completions.
- Re-drive idempotence: redriveInstallingProposals skips non-installing proposals, isolates failures (logs without throwing), and resumes only proposals stuck in installing status.
- Promotion provenance immutability: every promoted skill (new or refined) must carry provenance: agent-proposed and originatingProposalId in skill.yaml as audit metadata.
- Promotion conflict prevention: rejects if a catalog skill with the same name exists (new skills) or target skill does not exist (refinements).

## Interface Contract

```ts

```

## Dependency Slice

```
import { emitProposalApproved, emitProposalCreated, emitProposalRejected } from '../../src/proposals/events'
import { GateRunError, runGate } from '../../src/proposals/gate'
import { MODEL_INSTALL_TOPIC, ModelHandlerDeps, onApproveModelProposal, onRejectModelProposal, redriveInstallingProposals } from '../../src/proposals/model-handlers'
import { GateNotReadyError, PromotionError, promote } from '../../src/proposals/promote'
import { SkillProposal, createProposal, getProposal, updateProposal } from '@harness-engineering/core'
import { EvictPoolRequest, EvictPoolResult, InstallPoolRequest, InstallPoolResult, PoolEntry, PoolState } from '@harness-engineering/local-models'
import { ModelProposalRecord, Proposal } from '@harness-engineering/types'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
