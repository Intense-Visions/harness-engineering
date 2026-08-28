---
schemaVersion: 1
module: 'packages/core/tests/architecture/collectors'
sourceHash: '97f9208b9059f449afcad6bcbfdc89da97c23ba315f1f7b28a84ce04c9f935f5'
compiledAt: '2026-08-28T01:22:10.724Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

This test suite validates architecture collectors—pluggable violation detectors that scan a codebase for structural problems (circular dependencies, complexity, coupling, layer violations, forbidden imports, module size, dependency depth). Each collector implements a `collect(config, projectPath)` async method that orchestrates detection and normalizes results via a uniform `Collector` interface. Collectors wrap lower-level detectors (e.g., `detectCircularDeps`, `detectComplexityViolations`), transform domain-specific violations into shared `MetricResult` objects with stable violation IDs, filter severity (keeps `error`/`warning`, drops `info`), and include category metadata and analysis stats. The tests mock the underlying detection layer and verify correct categorization, stable hashing, severity mapping, and metadata threading.

## Invariants

- Violation IDs are deterministic (same input → same 64-char hex sha256); ID computation includes category, scope, and violation detail
- Each collector returns exactly one MetricResult in an array, containing violations array, value (count), metadata object, and scope
- Only error and warning severity violations surface; info-severity is silently excluded (enforced by Violation type)
- Violation file paths are relative to project root, not absolute paths
- Each collector has an immutable category string (circular-deps, complexity, coupling, etc.) used in ID hashing and result categorization
- excludePatterns from config must propagate to findFiles() during file discovery; collectors pass them through to the detection layer
- Metadata varies by collector (e.g., largestCycle/cycleCount for circular-deps; filesAnalyzed/functionsAnalyzed for complexity)
- Detection layer contract is replaceable via mocks; collectors assume Result&lt;T&gt; envelope shape with ok/value fields

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
