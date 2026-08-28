---
schemaVersion: 1
module: 'packages/core/tests/parallelization'
sourceHash: 'b78906bafef3d87322c88af78ce5f5a563f6591fa901cad4ce73713b1d68a03d'
compiledAt: '2026-08-28T01:22:10.878Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['ownership.test.ts', 'plan.test.ts']
---

## Summary

`packages/core/tests/parallelization` tests the task scheduling engine that decides whether and how to parallelize work. The module orchestrates five major concerns: **path overlap detection** (globs vs concrete paths), **ownership conflict forecasting** (multiple tasks claiming overlapping `owns` declarations), **dependency graph construction** (explicit `dependsOn` + implicit edges from shared files or owned paths), **plan validation** (cycles, forward references, unknown deps), and **execution classification** (serialize vs confirm vs auto-dispatch based on severity, wave size, and analysis depth).

The planner produces waves (parallel groups) stratified by dependency order, surfaces cyclic and high-severity conflicted tasks into a serialized bucket, and generates human-readable narration explaining every wait relationship. A critical cross-bucket guard prevents waves from firing before serialized upstream tasks complete.

## Invariants

- Mutual disjoint buckets — every task lands in exactly one of waves, serialized, or cyclic; no overlap.
- Implicit edge for shared files — when task B declares a file that task A also touches, an implicit edge A→B is added (order-preserving: later depends on earlier).
- Implicit edge for overlapping owns — when task A's owns glob covers a file task B touches, an implicit edge A→B is added (same order rule).
- No duplicate edges — explicit dependsOn edges are preserved; implicit edges skip pairs already connected.
- Severity precedence in classifyFiring — high-severity always serializes regardless of wave size; medium-severity gates on wave size first, then medium; low/none gate on size then analysis level.
- Cross-bucket downgrade guard — a wave whose all upstream dependencies are in serialized or cyclic caps at confirm firing (never auto-dispatch), ensuring serialized work completes before downstream parallelism.
- Cycle detection — explicit + implicit edges together are checked for cycles; cyclic tasks are removed from DAG scheduling and reported separately.
- Deterministic narration — output is bit-for-bit identical across runs; task lists and reason strings are sorted/stable.
- Ownership conflicts flag both sides — when two tasks both declare owns and their globs overlap, a single conflict tuple lists all overlapping pattern pairs; flagging is pairwise and order-preserving.
- Owns requires both sides — forecastOwnershipConflicts skips pairs where only one side declares owns; plain files field does not participate in ownership forecasting.

## Interface Contract

```ts

```

## Dependency Slice

```
import { forecastOwnershipConflicts, pathsOverlap } from '../../src/parallelization/ownership'
import { FiringDecision, WaveSeverity, buildTaskGraph, classifyFiring, deriveFiring, planParallelization, validatePlanTasks } from '../../src/parallelization/plan'
import { ConflictPrediction } from '@harness-engineering/graph'
import { PlanTask } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
