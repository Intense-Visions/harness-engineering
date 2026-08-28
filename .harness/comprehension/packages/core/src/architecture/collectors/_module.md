---
schemaVersion: 1
module: 'packages/core/src/architecture/collectors'
sourceHash: '20aa8e53b8d877b258c4ca7d8997b845e096b7cc91d0beffd7c4410a2db76e71'
compiledAt: '2026-08-28T01:22:10.279Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'circular-deps.ts',
    'complexity.ts',
    'coupling.ts',
    'dep-depth.ts',
    'forbidden-imports.ts',
    'hash.ts',
    'index.ts',
    'layer-violations.ts',
    'module-size.ts',
  ]
---

## Summary

The `collectors` module provides a pluggable architecture analysis engine that runs seven independent static checks on TypeScript codebases. Each collector discovers violations (circular dependencies, complexity, coupling, forbidden imports, layer boundaries, module size, dependency depth) as deterministic, immutable records. The system runs collectors in parallel with fault isolation—a failure in one doesn't crash others. Each collector implements a uniform interface: `collect(config, rootDir)` scans the codebase and returns `MetricResult[]` with category, scope, aggregate value, violations list, and metadata. Violations are hashed deterministically so the same problem always gets the same ID across runs, enabling merge gates to track violations as immutable and deduplicate them. Discovery happens either via filesystem scanning (module-size, dep-depth) or delegation to shared constraint validators (forbidden-imports, layer-violations, circular-deps). Complexity and coupling build minimal snapshot stubs and call entropy detectors.

## Invariants

- Violation IDs are deterministic SHA256 hashes of (path:category:detail), excluding line numbers—enables deduplication across runs and replay detection when violations resurface after being fixed
- Constraint rule IDs are deterministic SHA256 hashes of (category:scope:description)—the same rule always has the same identity, even if the description changes
- Paths are POSIX-normalized before hashing—callers must use relativePosix() to ensure cross-platform determinism (Windows backslashes would produce different IDs)
- Collectors fail independently via error MetricResults, never throw—Promise.allSettled() catches rejections; one collector's exception doesn't block others or exit the process
- Test files (.test.ts, .spec.ts, .test.tsx) are globally excluded—LOC counts, file counts, and dependency discovery skip them automatically to avoid inflating metrics
- Exclusion patterns from ArchConfig are honored by all collectors—callers resolve patterns once and pass them to discovery functions so configuration is uniform across parallel runs
- Module-size and dep-depth own their file scanning; others reuse shared validators—CircularDepsCollector, ForbiddenImportCollector, and LayerViolationCollector call validateDependencies() or detectCircularDeps(); Complexity and Coupling build lightweight snapshot objects; ModuleSize and DepDepth implement custom recursive directory walks
- Violation IDs remain stable across unrelated code edits—because line numbers are excluded, reformatting a file or adding comments doesn't change violation IDs, allowing gates to ignore noise and track only semantic problems

## Interface Contract

```ts
export CircularDepsCollector
export ComplexityCollector
export CouplingCollector
export DepDepthCollector
export ForbiddenImportCollector
export LayerViolationCollector
export ModuleSizeCollector
export constraintRuleId
export defaultCollectors
export runAll
export violationId
```

## Dependency Slice

```
import { detectCircularDeps } from '../../constraints/circular-deps'
import { buildDependencyGraph, validateDependencies } from '../../constraints/dependencies'
import { DependencyViolation } from '../../constraints/types'
import { detectComplexityViolations } from '../../entropy/detectors/complexity'
import { detectCouplingViolations } from '../../entropy/detectors/coupling'
import { CodebaseSnapshot } from '../../entropy/types'
import { findFiles, relativePosix } from '../../shared/fs-utils'
import { getDefaultRegistry } from '../../shared/parsers/registry'
import { isExcluded, resolveExcludePatterns } from '../exclude'
import { ArchConfig, Collector, ConstraintRule, MetricResult, Violation } from '../types'
import { CircularDepsCollector } from './circular-deps'
import { ComplexityCollector } from './complexity'
import { CouplingCollector } from './coupling'
import { DepDepthCollector } from './dep-depth'
import { ForbiddenImportCollector } from './forbidden-imports'
import { constraintRuleId, violationId } from './hash'
import { LayerViolationCollector } from './layer-violations'
import { ModuleSizeCollector } from './module-size'
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
```
