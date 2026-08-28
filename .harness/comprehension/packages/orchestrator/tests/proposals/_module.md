---
schemaVersion: 1
module: 'packages/orchestrator/tests/proposals'
sourceHash: '3360d3d5d23546303899d84d944e057a66e3645bbd172d04e5af6f93f9e7b7c0'
compiledAt: '2026-08-28T01:22:12.621Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['events.test.ts', 'gate.test.ts', 'model-handlers.test.ts', 'promote.test.ts']
---

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
