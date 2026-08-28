---
schemaVersion: 1
module: 'packages/core/tests/architecture/collectors'
sourceHash: '97f9208b9059f449afcad6bcbfdc89da97c23ba315f1f7b28a84ce04c9f935f5'
compiledAt: '2026-08-28T01:22:10.724Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'circular-deps.test.ts',
    'complexity.test.ts',
    'constraint-rule-id.test.ts',
    'coupling.test.ts',
    'dep-depth.test.ts',
    'forbidden-imports.test.ts',
    'get-rules.test.ts',
    'hash.test.ts',
    'index.test.ts',
    'layer-violations.test.ts',
    'module-size.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CircularDepsCollector } from '../../../src/architecture/collectors/circular-deps'
import { ComplexityCollector } from '../../../src/architecture/collectors/complexity'
import { CouplingCollector } from '../../../src/architecture/collectors/coupling'
import { DepDepthCollector } from '../../../src/architecture/collectors/dep-depth'
import { ForbiddenImportCollector } from '../../../src/architecture/collectors/forbidden-imports'
import { constraintRuleId, violationId } from '../../../src/architecture/collectors/hash'
import { defaultCollectors, runAll } from '../../../src/architecture/collectors/index'
import { LayerViolationCollector } from '../../../src/architecture/collectors/layer-violations'
import { ModuleSizeCollector } from '../../../src/architecture/collectors/module-size'
import { ArchConfig, Collector, ConstraintRule, MetricResult } from '../../../src/architecture/types'
import { detectCircularDeps } from '../../../src/constraints/circular-deps'
import { buildDependencyGraph, validateDependencies } from '../../../src/constraints/dependencies'
import { detectComplexityViolations } from '../../../src/entropy/detectors/complexity'
import { detectCouplingViolations } from '../../../src/entropy/detectors/coupling'
import from '../../../src/shared/fs-utils'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
```
