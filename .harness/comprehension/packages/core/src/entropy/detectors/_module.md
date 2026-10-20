---
schemaVersion: 1
module: 'packages/core/src/entropy/detectors'
sourceHash: '724ec2dce90a25e29ecead0e2ff5f118d7dd3cfb41fcb81900232ab719d05c15'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'complexity.ts',
    'coupling.ts',
    'dead-code.ts',
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
import { DEFAULT_SKIP_DIRS } from '@harness-engineering/graph'
import { minimatch } from 'minimatch'
import { readdirSync, statSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { basename, dirname, extname, resolve } from 'path'
```
