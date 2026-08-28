---
schemaVersion: 1
module: 'packages/core/src/proposals'
sourceHash: '667360094bd5ba52bd375cc92241afec44e5aa2f725402b956bb27226b1cc760'
compiledAt: '2026-08-28T01:22:10.444Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'store.ts', 'usage.ts']
---

## Interface Contract

```ts
export ListProposalsOptions
export ModelProposalContent
export ModelProposalRecord
export Proposal
export ProposalConflictError
export ProposalNotFoundError
export ProposalSchema
export ProposalType
export SkillKind
export SkillProposal
export SkillUsageStats
export createModelProposal
export createProposal
export deriveSkillUsage
export getProposal
export listProposals
export proposalsDir
export updateProposal
```

## Dependency Slice

```
import { readAdoptionRecords } from '../adoption/reader'
import { EmitSkillProposalInput, EmitSkillProposalInputSchema, ModelProposalContent, ModelProposalRecord, Proposal, ProposalSchema, ProposalSource, ProposalStatus, ProposalType, SkillProposal, SkillProposalSchema } from '@harness-engineering/types'
import { randomUUID } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
