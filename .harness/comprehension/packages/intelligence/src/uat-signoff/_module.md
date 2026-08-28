---
schemaVersion: 1
module: 'packages/intelligence/src/uat-signoff'
sourceHash: '6d9f0244ee7c1a05f48f49cf63dfefb5856bb9ba53ff1f83031988ec0ee2cd2c'
compiledAt: '2026-08-28T01:22:11.867Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'recorder.ts', 'types.ts']
---

## Summary

`uat-signoff` records human User Acceptance Testing verdicts as durable graph nodes. It is the terminal, human-authority stage of the change lifecycle: the human judges whether the shipped implementation meets the spec's Success Criteria (intent vs. reality), and this module captures that decision—unchanged, unfiltered, advisory—into the shared `execution_outcome` graph contract. No LLM judgment, no derived ship authority; the human is the sole source of truth. The recorder exposes a single class (`UatSignoffRecorder`) that takes a human decision (overall verdict + per-item dispositions) and a pure mapper (`toUatExecutionOutcome`) that converts the human's judgment into an `execution_outcome` node. Downstream signals (eval-fail-rate, effectiveness baselines) consume it via the shared node schema without reimplementing logic.

## Invariants

- Human is the authority: module records the human's decision verbatim with no LLM verdict, derived ship gates, or blocking authority.
- Result mapping is direct: ACCEPTED → success; REJECTED or CHANGES_REQUESTED → failure.
- Per-item dispositions → failureReasons: only non-ACCEPT items are recorded as failure reasons in the outcome node.
- Unique ID per sign-off via collision-free randomUUID() to prevent millisecond-collision overwrites.
- No system blast radius: affectedSystemNodeIds is always empty (sign-off is acceptance-record, not code-change analysis).
- durationMs is always 0 (human sign-off does not time work; advisory metadata only).
- Source tag invariant: every node carries metadata.source='uat-signoff' to distinguish human verdicts from LLM outcome-eval results.
- Item IDs are spec-native, sourced from Success Criteria ids in proposal.md (e.g., SC1, SC2); recorder never invents IDs.
- Metadata carries human intent: outcome wraps slug, decision, signedOffBy, criteriaRefs, and full items (immutable by connector); core keys (result, timestamp) written by connector only.
- Advisory, never blocking: record is for signal consumption (eval effectiveness, baseline trending); does not gate merges or ship decisions.

## Interface Contract

```ts
export UAT_SIGNOFF_SOURCE
export UatItemDisposition
export UatOverallDecision
export UatSignoffInput
export UatSignoffItem
export UatSignoffRecorder
export toUatExecutionOutcome
```

## Dependency Slice

```
import { ExecutionOutcomeConnector, OutcomeIngestResult } from '../outcome/connector.js'
import { ExecutionOutcome } from '../outcome/types.js'
import { UatSignoffInput } from './types.js'
import { GraphStore } from '@harness-engineering/graph'
import { randomUUID } from 'node:crypto'
```
