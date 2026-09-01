---
schemaVersion: 1
module: 'packages/core/src/entropy/detectors'
sourceHash: '480e5e83308a1126575c7b8ca221acf6e4300e17ea751ed1479934733c86b5eb'
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
import { resolveAliasCandidates } from '../path-aliases'
import { CodebaseSnapshot, ComplexityConfig, ComplexityReport, ComplexityViolation, ConfigPattern, CouplingConfig, CouplingReport, CouplingViolation, DeadCodeReport, DeadExport, DeadFile, DeadInternal, DocumentationDrift, DriftConfig, DriftReport, EntropyError, PatternConfig, PatternMatch, PatternReport, PatternViolation, SizeBudgetConfig, SizeBudgetReport, SizeBudgetViolation, SourceFile, UnusedImport } from '../types'
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph'
import { minimatch } from 'minimatch'
import { readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { basename, dirname, extname, resolve } from 'path'
```
