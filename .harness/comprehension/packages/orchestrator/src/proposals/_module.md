---
schemaVersion: 1
module: 'packages/orchestrator/src/proposals'
sourceHash: 'cfe15fa518443697efdff6b18819da4fe4c1e7dbcbb29f2cc525c6083598e849'
compiledAt: '2026-08-28T01:22:12.330Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['events.ts', 'gate.ts', 'index.ts', 'model-handlers.ts', 'promote.ts']
---

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
