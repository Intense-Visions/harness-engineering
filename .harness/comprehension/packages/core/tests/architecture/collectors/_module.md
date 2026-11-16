---
schemaVersion: 1
module: 'packages/core/tests/architecture/collectors'
sourceHash: 'ee9b57d500b989f663edc5c7d6493f8406dbd765f04685234815f04fa37bd8d1'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'circular-deps.test.ts',
    'collectors-parser-unavailable.test.ts',
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
    'planted-positives.test.ts',
    'run-context.test.ts',
    'shared-parse.test.ts',
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
import { SharedImportParser, createCollectorRunContext } from '../../../src/architecture/collectors/run-context'
import { ArchConfig, Collector, ConstraintRule, MetricResult } from '../../../src/architecture/types'
import { detectCircularDeps } from '../../../src/constraints/circular-deps'
import { buildDependencyGraph, validateDependencies } from '../../../src/constraints/dependencies'
import { detectComplexityViolations } from '../../../src/entropy/detectors/complexity'
import { detectCouplingViolations } from '../../../src/entropy/detectors/coupling'
import '../../../src/shared/fs-utils'
import { AST, Import, LanguageParser, ParseError } from '../../../src/shared/parsers'
import { getDefaultRegistry, resetDefaultRegistry } from '../../../src/shared/parsers/registry'
import { TypeScriptParser } from '../../../src/shared/parsers/typescript'
import { Err, Ok } from '../../../src/shared/result'
import { mkdir, mkdtemp, rm, writeFile } from 'fs/promises'
import * as fs from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'node:path'
import * as path from 'node:path'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
