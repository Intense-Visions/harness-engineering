---
schemaVersion: 1
module: 'packages/core/src/entropy/detectors'
sourceHash: '4825517357f64b3abe7e00444f90a9c053d4c22c2e84d9adbdeb0331a696ab4c'
compiledAt: '2026-08-28T01:22:10.368Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'complexity.ts',
    'coupling.ts',
    'dead-code.ts',
    'drift.ts',
    'index.ts',
    'patterns.ts',
    'size-budget.ts',
  ]
---

## Interface Contract

```ts
export detectComplexityViolations
export detectCouplingViolations
export detectDeadCode
export detectDocDrift
export detectPatternViolations
export detectSizeBudgetViolations
export parseSize
```

## Dependency Slice

```
import { ProtectedRegionMap } from '../../annotations'
import { fileExists, relativePosix } from '../../shared/fs-utils'
import { AST } from '../../shared/parsers'
import { Ok, Result } from '../../shared/result'
import { CodebaseSnapshot, ComplexityConfig, ComplexityReport, ComplexityViolation, ConfigPattern, CouplingConfig, CouplingReport, CouplingViolation, DeadCodeReport, DeadExport, DeadFile, DeadInternal, DocumentationDrift, DriftConfig, DriftReport, EntropyError, PatternConfig, PatternMatch, PatternReport, PatternViolation, SizeBudgetConfig, SizeBudgetReport, SizeBudgetViolation, SourceFile, UnusedImport } from '../types'
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph'
import { minimatch } from 'minimatch'
import { readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { basename, dirname, extname, resolve } from 'path'
```
