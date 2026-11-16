---
schemaVersion: 1
module: 'packages/core/src/entropy/detectors'
sourceHash: 'e8034a34db1aec7cb609d6e0960b9075b79bc12d9c8ad950f5c92230b68d84cd'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'complexity.ts',
    'coupling.ts',
    'dead-code.ts',
    'drift-symbols.ts',
    'drift.ts',
    'duplication.ts',
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
export detectDuplication
export detectPatternViolations
export detectSizeBudgetViolations
export parseSize
```

## Dependency Slice

```
import { ProtectedRegionMap } from '../../annotations'
import { CloneIndex, DuplicationConfig, FileSkipReason, SkippedFile, buildCloneIndex } from '../../duplication'
import { createEntropyError } from '../../shared/errors'
import { fileExists, relativePosix } from '../../shared/fs-utils'
import { AST } from '../../shared/parsers'
import { Err, Ok, Result } from '../../shared/result'
import { resolveAliasCandidates } from '../path-aliases'
import { CodebaseSnapshot, ComplexityConfig, ComplexityReport, ComplexityViolation, ConfigPattern, CouplingConfig, CouplingReport, CouplingViolation, DeadCodeReport, DeadExport, DeadFile, DeadInternal, DocumentationDrift, DriftConfig, DriftReport, DuplicationReport, EntropyError, PatternConfig, PatternMatch, PatternReport, PatternViolation, SizeBudgetConfig, SizeBudgetReport, SizeBudgetViolation, SourceFile, UnusedImport } from '../types'
import { collectDeclaredNames, resolveReferenceName } from './drift-symbols'
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph'
import { minimatch } from 'minimatch'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { basename, dirname, extname, resolve } from 'path'
```
