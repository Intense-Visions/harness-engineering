---
schemaVersion: 1
module: "packages/orchestrator/src/proposals"
sourceHash: "cfe15fa518443697efdff6b18819da4fe4c1e7dbcbb29f2cc525c6083598e849"
compiledAt: "2026-08-28T01:22:12.330Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["events.ts", "gate.ts", "index.ts", "model-handlers.ts", "promote.ts"]
---

## Summary

The proposals module owns the skill and model proposal lifecycle from creation through gating to promotion. It provides thin event wrappers that emit stable lifecycle notifications (created, approved, rejected), runs mechanical validation gates on skill proposals (YAML parsing, kebab-case naming, markdown content validation), and integrates model-proposal approval/rejection with PoolManager to drive atomic pool mutations and stale-target detection. Gate checks are synchronous and gate transitions are determined by finding severity; model handlers coordinate with the pool seam to persist decisions and defer evictions of in-use models.

## Invariants

- Gate execution is idempotent and limited to pending proposals; already approved/rejected proposals block re-runs with GateRunError.
- Gate status transitions to gate-failed if any error-severity finding exists; gate-running otherwise; findings are always written to disk.
- Pool mutations (install/evict) flow exclusively through ModelPoolOps to maintain atomicity, enforce allowlist guards, and coordinate disk budget.
- Stale-target model proposals (HF 404 on upstream) transition to failed_target_missing without mutating pool state; next diff cycle may raise a fresh proposal for explicit approval.
- Skill names must match /^[a-z][a-z0-9-]*$/ (kebab-case); violations produce error-severity findings and block promotion.
- Refinement diffs must be in unified-diff format (include both --- and +++ headers and at least one @@ hunk marker); missing markers block promotion.
- S1 in-use safety: models with pending evictions are marked via PoolManager.markPendingEviction() and defer the mutation until the in-use probe confirms idle; orchestrator drain path completes eviction.
- Proposal lifecycle events (created/approved/rejected) use fixed, validated payload shapes; these survive schema evolution and are consumed by webhook fan-out and notification dispatch unmodified.

## Interface Contract

```ts
export GateNotReadyError
export GateResult
export GateRunError
export MODEL_POOL_TOPIC
export MODEL_PROPOSAL_TOPIC
export ModelApproveOutcome
export ModelHandlerDeps
export ModelPoolOps
export ModelProposalPatch
export PromotionError
export PromotionResult
export ProposalApprovedData
export ProposalCreatedData
export ProposalRejectedData
export emitProposalApproved
export emitProposalCreated
export emitProposalRejected
export onApproveModelProposal
export onRejectModelProposal
export promote
export runGate
```

## Dependency Slice

```
import { ProposalGateFinding, ProposalNotFoundError, SkillKind, SkillProposal, getProposal, updateProposal } from '@harness-engineering/core'
import { EvictPoolRequest, EvictPoolResult, InstallEvent, InstallPoolRequest, InstallPoolResult, PoolEntry, PoolState } from '@harness-engineering/local-models'
import { ModelInstallEvent, ModelProposalRecord, Proposal, ProposalDecision } from '@harness-engineering/types'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseYaml, stringifyYaml } from 'yaml'
```
