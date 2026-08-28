---
schemaVersion: 1
module: 'packages/dashboard/src/client/components/kanban'
sourceHash: '3042843f3e0e10209ff24800265fb9673af5214a163e46dc32da56450c39cfbb'
compiledAt: '2026-08-28T01:22:11.210Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['KanbanCard.tsx', 'KanbanLane.tsx']
---

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
