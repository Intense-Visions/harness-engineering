---
schemaVersion: 1
module: 'packages/core/tests/proposals'
sourceHash: '735f64190869c5b8245923d76e3a01a2c8443e19a0cb691a4f741c35a65ef720'
compiledAt: '2026-08-28T01:22:10.886Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['store.test.ts', 'usage.test.ts']
---

## Summary

The `packages/core/tests/proposals` module tests a persistent proposal system for two types of structured changes: skill evolutions (new skills or refinements) and model selection decisions. Proposals live in `.harness/proposals/` as JSON files, tracked through a lifecycle (open → rejected/approved/gate-running). The test suite covers creation with conflict detection (preventing duplicate refinements), retrieval with filtering by status/kind, updates that guard immutable metadata, and read-time schema migration for legacy records. A companion `deriveSkillUsage` function reads adoption metrics from `.harness/metrics/adoption.jsonl` to calculate skill usage within configurable time windows—enabling feedback loops that inform skill maturation decisions.

## Invariants

- Proposal IDs match /^proposal\_[a-f0-9]+$/ and serve as both identity and file basename
- id, createdAt, and kind/skillKind fields are immutable; updateProposal rejects mutations to these fields
- Only one open refinement per (targetSkill, proposedBy) tuple; duplicate attempts throw ProposalConflictError until first is rejected/approved
- All proposals follow a discriminated-union shape with top-level kind ('skill' or 'model'); skill proposals nest skillKind ('new-skill' or 'refinement')
- Legacy on-disk records (pre-generalization with kind at top level) must be automatically upcycled to new discriminated shape at read-time
- listProposals returns proposals in newest-first order (descending createdAt); filtering by status/kind is stable across this ordering
- deriveSkillUsage counts skill usages within a configurable window (default 90 days); ignores older adoption records and returns zero if adoption file is absent
- Proposal JSON persists to .harness/proposals/{id}.json; adoption metrics append line-by-line to .harness/metrics/adoption.jsonl

## Interface Contract

```ts

```

## Dependency Slice

```
import { ProposalConflictError, ProposalNotFoundError, createModelProposal, createProposal, getProposal, listProposals, updateProposal } from '../../src/proposals/store'
import { deriveSkillUsage } from '../../src/proposals/usage'
import { ModelProposalContent } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
