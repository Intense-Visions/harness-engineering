---
schemaVersion: 1
module: 'packages/intelligence/tests/uat-signoff'
sourceHash: '03ab4083a6aeb543915c3c37f34a8bac3fe6e8f5244db975cac4163f5bca9fc2'
compiledAt: '2026-08-28T01:22:11.922Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['recorder.test.ts']
---

## Summary

The **uat-signoff** test module validates UAT (User Acceptance Testing) sign-off tracking—converting human approval decisions into recorded graph nodes that feed failure-rate analysis. Two core functions: (1) **toUatExecutionOutcome** transforms a sign-off decision (slug, acceptance/rejection, signed-off party, per-item dispositions) into an `execution_outcome` node shape, mapping ACCEPTED→success and REJECTED/CHANGES_REQUESTED→failure; (2) **UatSignoffRecorder** persists the converted outcome to a GraphStore, tagged with source `'uat-signoff'`, queryable for eval-fail-rate calculation. UAT outcomes are advisory records, not persona actors—they don't contribute to effectiveness scoring since they lack persona or affected-system linkage.

## Invariants

- Decision mapping: ACCEPTED → result:'success'; REJECTED or CHANGES_REQUESTED → result:'failure'
- Failure reasons: Only items with disposition ≠ 'ACCEPT' are collected (REJECT or CHANGES_REQUESTED)
- Collision resistance: Each call to toUatExecutionOutcome(input) produces a unique id, even for identical inputs
- Single node per record: UatSignoffRecorder.record() adds exactly one execution_outcome node to the store
- Eval-fail-rate contract: Recorded nodes must have metadata.result and metadata.timestamp (explicitly read by eval-fail-rate)
- Required metadata: source is always 'uat-signoff', signedOffBy is preserved from input
- Graph queryability: Outcome nodes are findable via store.findNodes({ type: 'execution_outcome' })
- Persona neutrality: Nodes have affectedSystemNodeIds:[] and linkedSpecId:null; scorer traverses without error but never counts them
- Defaults: timestamp defaults to now; criteriaRefs defaults to []
- Identifier scheme: issueId='uat-signoff', identifier='uat-signoff:{slug}', id matches /^outcome:uat-signoff:{slug}:/

## Interface Contract

```ts

```

## Dependency Slice

```
import { computePersonaEffectiveness } from '../../src/effectiveness/scorer.js'
import { UAT_SIGNOFF_SOURCE, UatSignoffInput, UatSignoffRecorder, toUatExecutionOutcome } from '../../src/uat-signoff/index.js'
import { GraphStore } from '@harness-engineering/graph'
import { describe, expect, it } from 'vitest'
```
