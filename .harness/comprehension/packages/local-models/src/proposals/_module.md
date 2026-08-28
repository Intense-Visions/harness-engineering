---
schemaVersion: 1
module: 'packages/local-models/src/proposals'
sourceHash: '2c51b80e5d9fb2d4295cb04ba10a91c95904d0d1f735d01c2d7d3f297d359a66'
compiledAt: '2026-08-28T01:22:11.972Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['engine.ts', 'index.ts', 'justification.ts']
---

## Summary

The `packages/local-models/src/proposals` module is the model-proposal diff engine (Phase 5b) — a pure, deterministic function that compares the current pool of models against a ranked candidate list and emits swap proposals. The core export `diffPoolAgainstRanking` is side-effect free: it takes a pool snapshot, ranking, and history of pending/rejected swaps, then returns at most one proposal per pool entry where a ranked candidate beats it by at least `proposalThreshold`.

The module suppresses redundant proposals in two ways: _pair-level_ for rejected swaps (exact `(target, replaces)` never resurfaces) and _target-level_ for pending installs (a model already queued for install won't be proposed again to replace a different entry). If a candidate is suppressed, the engine falls through to the next-best viable option rather than skipping the entry—rejected suggestions don't block discovery of new candidates.

A companion function `buildJustification` renders scored candidates into human-readable rationales (summary, benchmark basis, hardware fit, evidence grade, snapshot date) for the review queue. The module is deliberately stateless—persisting records, scheduling, and the approve/install lifecycle belong to the caller (Phase 6 scheduler and orchestrator handler).

## Invariants

- F6: A swap is proposed only if the candidate score exceeds the current entry's score by at least proposalThreshold
- F7: A (target, replaces) pair in the rejected history is never re-emitted, even on later diffs
- No pending-target re-proposal: If a model is the install target of any pending proposal, it cannot be proposed to replace a different pool member (prevents multi-proposal accumulation on the same blob)
- Rejected vs. pending suppression differ: Rejecting a swap does not veto proposing the same model for a different entry; but a pending proposal suppresses all future proposals for that target across entries
- F7 fall-through: If the top-ranked candidate for an entry is suppressed, scanning continues to find the next-best eligible candidate; suppression never causes the entry to be skipped
- Deterministic ordering: Entries are sorted by ollamaName before processing; same (pool, ranked, history) input always yields identical proposals
- Single-claim per diff: Each ranked candidate can be claimed by at most one pool entry in a single diff run—no candidate is proposed twice
- Hardware filter: Only fitsHardware=true candidates are eligible; VRAM mismatch kills a proposal before score comparison
- Pooled-name uniqueness: A candidate already in pooledNames is ineligible (no duplicates in the pool)
- Ollama name required: Candidates without ollamaName defined are skipped (identity required for the swap)

## Interface Contract

```ts
export DedupPair
export DiffInput
export JustificationInput
export buildJustification
export diffPoolAgainstRanking
```

## Dependency Slice

```
import { PoolEntry, PoolState } from '../pool/types.js'
import { estimateDiskGb } from '../ranker/index.js'
import { RankedModel } from '../ranker/types.js'
import { buildJustification } from './justification.js'
import { ModelProposalContent } from '@harness-engineering/types'
```
