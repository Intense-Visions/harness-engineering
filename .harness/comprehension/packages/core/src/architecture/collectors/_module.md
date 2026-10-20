---
schemaVersion: 1
module: 'packages/core/src/architecture/collectors'
sourceHash: '8db5291662afab4a83df86616095ddc99dfe3c0aa87c035a9d39c5731b7140b2'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
import { defineLayer } from '../../constraints/layers'
import { DependencyValidation, DependencyViolation, Layer } from '../../constraints/types'
import { detectComplexityViolations } from '../../entropy/detectors/complexity'
import { detectCouplingViolations } from '../../entropy/detectors/coupling'
import { CodebaseSnapshot } from '../../entropy/types'
import { findFiles, relativePosix } from '../../shared/fs-utils'
import { Import } from '../../shared/parsers'
import { getDefaultRegistry } from '../../shared/parsers/registry'
import { isExcluded, resolveExcludePatterns } from '../exclude'
import { ArchConfig, ArchForbiddenImportRule, Collector, ConstraintRule, MetricResult, Violation } from '../types'
import { CircularDepsCollector } from './circular-deps'
import { ComplexityCollector } from './complexity'
import { CouplingCollector } from './coupling'
import { DepDepthCollector } from './dep-depth'
import { ForbiddenImportCollector } from './forbidden-imports'
import { constraintRuleId, violationId } from './hash'
import { LayerViolationCollector } from './layer-violations'
import { ModuleSizeCollector } from './module-size'
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph'
import { minimatch } from 'minimatch'
import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { dirname, resolve } from 'path'
```
