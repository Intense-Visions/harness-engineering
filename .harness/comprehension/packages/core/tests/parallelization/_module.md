---
schemaVersion: 1
module: 'packages/core/tests/parallelization'
sourceHash: 'b78906bafef3d87322c88af78ce5f5a563f6591fa901cad4ce73713b1d68a03d'
compiledAt: '2026-08-28T01:22:10.878Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['ownership.test.ts', 'plan.test.ts']
---

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
