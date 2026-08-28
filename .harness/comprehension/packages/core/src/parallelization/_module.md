---
schemaVersion: 1
module: 'packages/core/src/parallelization'
sourceHash: '7901872f93ee158dbe470c94141f904c375d85a4c44ca49443d81056c937c5be'
compiledAt: '2026-08-28T01:22:10.429Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['ownership.ts', 'plan.ts']
---

## Interface Contract

```ts
export buildTaskGraph
export classifyFiring
export deriveFiring
export forecastOwnershipConflicts
export narrate
export pathsOverlap
export planParallelization
export validatePlanTasks
export waveSeverity
```

## Dependency Slice

```
import { findParallelGroups } from '../review/parallel-groups'
import { GraphNode } from '../review/types'
import { OwnershipConflict, forecastOwnershipConflicts, pathsOverlap } from './ownership'
import { ConflictPrediction, ConflictSeverity } from '@harness-engineering/graph'
import { PlanTask } from '@harness-engineering/types'
import { minimatch } from 'minimatch'
```
