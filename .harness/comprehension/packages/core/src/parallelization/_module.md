---
schemaVersion: 1
module: 'packages/core/src/parallelization'
sourceHash: '7901872f93ee158dbe470c94141f904c375d85a4c44ca49443d81056c937c5be'
compiledAt: '2026-08-28T01:22:10.429Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['ownership.ts', 'plan.ts']
---

## Summary

`packages/core/src/parallelization` plans safe parallel execution of plan tasks by combining explicit dependencies with implicit file/path overlap detection. The module has two components: **ownership.ts** provides a cheap, deterministic forecast of parallel conflicts by comparing task-declared `owns:[paths]` globs using glob-aware overlap (via minimatch). **plan.ts** builds the full task DAG (explicit `dependsOn` unioned with implicit file/owns overlaps), partitions tasks into independent waves, and assigns each wave a firing decision (auto-dispatch, confirm, serialize) based on conflict severity, wave size, and analysis depth. Three mutually-disjoint dispatch channels partition the output: `waves` (parallel-safe groups), `serialized` (high-conflict members forced sequential), and `cyclic` (blocked dependency cycles). The firing policy is risk-tiered: high-severity conflicts serialize, medium severity requires confirmation, file-only analysis requires confirmation (transitive conflicts unknown), and clean low/none + graph-expanded conditions auto-dispatch. A cross-bucket ordering guard bumps otherwise auto-dispatch waves to confirm if they depend on serialized/cyclic tasks.

## Invariants

- Mutual disjoint dispatch channels — each task appears in exactly one of: flattened waves ⊕ serialized ⊕ cyclic. Tasks forced serial or in cycles are removed from their source wave; empty waves are dropped.
- Overlap edges are oriented deterministically — implicit file/owns overlap edges always flow earlier-declared task → later-declared task in input order, ensuring stable and repeatable DAG structure.
- Validation and planning agree on cycles — both use the same buildTaskGraph() combining explicit dependsOn + implicit overlaps; a task the planner marks cyclic is never validated as clean.
- Glob-aware overlap is uniform and symmetric — concrete file paths are trivial globs, so pathsOverlap(a, b) === pathsOverlap(b, a), and src/api/** correctly overlaps both src/api/utils.ts (concrete) and src/api/v2/** (nested glob).
- Firing policy is deterministic and decision-ordered — classifyFiring() checks high → wave size → medium → file-only → auto-dispatch in a fixed order; the same severity + size + analysis level always yields the same decision.
- Optional owns declarations are backward compatible — tasks without owns (or empty owns) contribute zero conflicts; absent declarations are a no-op, preserving file-only overlap behavior.
- Cross-bucket prerequisites gate waves — if any task in an otherwise auto-dispatch wave depends on a task in the serialized/cyclic channel, that wave is bumped to confirm (never weaker, never forced to serialize).
- Narration output is deterministic — derived purely from sorted inputs (task IDs, wave order, dependency map); same logical plan always produces identical human-readable text.

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
