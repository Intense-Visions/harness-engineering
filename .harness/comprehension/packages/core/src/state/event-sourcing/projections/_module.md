---
schemaVersion: 1
module: 'packages/core/src/state/event-sourcing/projections'
sourceHash: 'baffa1f028310afaae6464cb8f9989deb7fd9c8bbbaf7dcc4042cd548b4feed4'
compiledAt: '2026-08-28T01:22:10.607Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['audit.ts', 'core-state.ts', 'lanes.ts']
---

## Summary

This module implements pure event-sourcing projections that fold the append-only event log into three legacy-shaped state views: audit trail, core workflow state (position/decisions/blockers/progress), and per-task lane assignments. All three projections follow an identical pattern: defensively copy and deterministically sort input events by (seq, writerId), then fold them using a dispatch table of event handlers. This makes the projections order-independent and safe for repeated calls. Scalar fields like position use last-event-wins semantics; collections like decisions/blockers use union-by-id semantics so no update is lost. The toHarnessState() bridge lifts the core projection into the exact HarnessState shape that existing callers expect, enabling Phase 2–3 swaps without touching downstream code.

## Invariants

- Deterministic sort is load-bearing: both bySeqThenWriter comparators must match the loadEvents() comparator exactly; if they differ, already-sorted logs become non-idempotent
- Input defensiveness: all three projections copy and sort, never mutate input arrays — callers may reuse or hash event arrays without risk
- Order-independence: because sorting is applied before folding, projections yield identical output regardless of input order
- Pure functions guarantee: no IO, no side effects, no external state — safe to call at any time and multiple times without observable side effects
- Last-event-wins for scalars (position, progress): highest-ordered event overwrites all prior values for that field; historical values intentionally discarded
- Union semantics for keyed collections (decisions, blockers, tasks): keyed by id; updates replace existing entries, inserts add new ones — all ids surface in output
- Genesis seed from state_imported: legacy state (if any) must come from the state_imported event type; unparseable legacyState is silently ignored
- exactOptionalPropertyTypes discipline: optional fields like lastSkill, pendingTasks, reason are only included in output if defined (never as undefined)
- Dispatch table over nested branching: event handlers factored into CORE_HANDLERS/LANE_HANDLERS tables keep complexity flat and prevent silent handler misses
- No append is lost: keyed maps ensure every event contributes; highest-seq event for each id wins, but all ids present in final projection

## Interface Contract

```ts
export formatAuditTimeline
export projectAudit
export projectCoreState
export projectLanes
export toHarnessState
```

## Dependency Slice

```
import { HarnessState, HarnessStateSchema } from '../../types'
import { Event, Lane } from '../events'
```
