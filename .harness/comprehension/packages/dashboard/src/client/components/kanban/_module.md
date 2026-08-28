---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/kanban'
sourceHash: '3042843f3e0e10209ff24800265fb9673af5214a163e46dc32da56450c39cfbb'
compiledAt: '2026-08-28T01:22:11.210Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['KanbanCard.tsx', 'KanbanLane.tsx']
---

## Summary

KanbanCard and KanbanLane form a two-level display hierarchy for in-flight work tasks. KanbanCard renders individual task cards with title, phase badge, identifier, backend name, elapsed time, workspace path, blockage state, and dependency links. KanbanLane wraps multiple cards into a kanban column, with special rendering for the done lane (compact id chips instead of full cards). Both accept a shared onBoardIdentifiers set to highlight cross-lane dependencies and a nowMs timestamp for consistent elapsed-time updates, projecting task state from the kanban-lanes utility layer.

## Invariants

- Lane-specific rendering: done lane must render as compact chips; all other lanes render full KanbanCard components. Missing the lane.id === 'done' check causes done tasks to display at full height.
- Synchronized clock: nowMs must be threaded consistently from parent to both components. Each calls formatElapsed(startedAt, nowMs). Stale nowMs causes elapsed timers to freeze.
- Dependency visibility: A blocker is highlighted as on-board only if identifier is non-null AND present in onBoardIdentifiers. Missing the null check or stale set membership causes cross-lane blockers to disappear.
- Blocker labeling fallback: Uses identifier ?? id ?? 'unknown'. Both null results in 'unknown' label; data layer must ensure at least id is present.
- Path segmentation: basename(path) splits on / and filters empty parts. Assumes forward-slash normalization; paths without / fall through to original value.
- Card key stability: Lane cards keyed by card.issueId; blocker chips keyed by ${label}-${i}. Unstable issueId or label changes during render cause React instance thrashing.

## Interface Contract

```ts
export KanbanCard
export KanbanLane
```

## Dependency Slice

```
import { KanbanCardData, KanbanLaneData } from '../../utils/kanban-lanes'
import { formatElapsed, phaseColor } from '../../utils/phase-presentation'
import { KanbanCard } from './KanbanCard'
```
