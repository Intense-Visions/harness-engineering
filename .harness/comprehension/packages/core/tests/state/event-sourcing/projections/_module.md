---
schemaVersion: 1
module: 'packages/core/tests/state/event-sourcing/projections'
sourceHash: '770b87ee5eb49f309354647e84600d088e645c739b3f379e0016758010e3c9e0'
compiledAt: '2026-08-28T01:22:11.066Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['audit.test.ts', 'core-state.test.ts', 'lanes.test.ts']
---

## Summary

This module tests two projection functions that fold event logs into readable state.

**`projectAudit`** filters the event stream to capture user interactions (user input, approval requests/responses) and formats them as a timeline. It sorts events by `(seq asc, writerId asc)` regardless of input order and carries verbatim text and timestamps. **`formatAuditTimeline`** renders the audit projection into human-readable "- HH:MM [label] text" lines with optional truncation and limiting.

**`projectCoreState`** folds a heterogeneous event stream into a legacy-shaped harness state object with position, decisions, blockers, progress, and session summary. It supports genesis seeding from a `state_imported` event (allows migrations from old state format) and merges concurrent writes using two different strategies: **union semantics** for append-only collections (decisions, blockers) and **last-write-wins** on `(seq, writerId)` for scalar fields (position, progress, blocker status).

## Invariants

- Deterministic sort order: Projections are order-independent; shuffling input yields identical output due to stable (seq, writerId) sorting.
- Graceful degradation: Invalid/missing data doesn't throw; legacyState is silently ignored if malformed; optional fields (e.g., interactionId) are omitted when absent.
- Union semantics on decisions/blockers: Concurrent writes from multiple agents never lose data—decisions and blockers from all writers coexist in the projection.
- Last-write-wins on scalars: For scalar fields (position, progress, blocker status), later events strictly override earlier ones, resolved by (seq, writerId) tuple.
- Blocker state is transactional: Blocker opened/resolved events compose; the most recent event determines final status regardless of order.
- Shape compatibility: Core projection preserves the legacy HarnessState shape for backward compatibility and consumer expectations.

## Interface Contract

```ts

```

## Dependency Slice

```
import { Event } from '../../../../src/state/event-sourcing/events'
import { formatAuditTimeline, projectAudit } from '../../../../src/state/event-sourcing/projections/audit'
import { projectCoreState, toHarnessState } from '../../../../src/state/event-sourcing/projections/core-state'
import { projectLanes } from '../../../../src/state/event-sourcing/projections/lanes'
import { HarnessStateSchema } from '../../../../src/state/types'
import { describe, expect, it } from 'vitest'
```
