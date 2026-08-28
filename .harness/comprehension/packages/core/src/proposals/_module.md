---
schemaVersion: 1
module: 'packages/core/src/proposals'
sourceHash: '667360094bd5ba52bd375cc92241afec44e5aa2f725402b956bb27226b1cc760'
compiledAt: '2026-08-28T01:22:10.444Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'store.ts', 'usage.ts']
---

## Summary

File-based proposal store for tracking skill refinements and model-pool recommendations. Persists proposals to `.harness/proposals/<id>.json` with atomic writes, supports filtering and updates, and derives skill usage stats from adoption telemetry. Core flows: create (UUID-based ID, Zod validation, atomic write with business rules), query (list with status/kind filters, sorted newest-first), update (shallow patches with immutability guards), and telemetry (skill invocation counts from adoption.jsonl). Discriminated union `Proposal` type handles both skill and model proposals; error types for conflict (multiple open refinements) and not-found.

## Invariants

- At most one open `skillKind: 'refinement'` per `targetSkill` at any time; enforced on create via ProposalConflictError
- All writes use tmp→rename pattern to prevent partial-write corruption
- `id`, `createdAt`, `kind`, and `skillKind` are immutable through updateProposal(); reassigned from current before re-validation
- updateProposal() preserves `skillKind` for skill proposals before schema parsing to prevent kind confusion during patches
- All proposals validated via Zod on read and write; malformed files return null rather than throw
- listProposals() always sorts by `createdAt` descending (newest first) for deterministic output
- .harness/proposals directory auto-created on first write; list returns [] gracefully on missing directory

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
