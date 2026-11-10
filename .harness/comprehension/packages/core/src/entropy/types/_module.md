---
schemaVersion: 1
module: 'packages/core/src/entropy/types'
sourceHash: 'f17bc631ca0c7e58ded49231c9195b3b5a375f87d2ae7e24cde772617817353b'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'complexity.ts',
    'config.ts',
    'coupling.ts',
    'dead-code.ts',
    'drift.ts',
    'duplication.ts',
    'fix.ts',
    'index.ts',
    'pattern-config.ts',
    'pattern.ts',
    'report.ts',
    'size-budget.ts',
    'snapshot.ts',
  ]
---

## Interface Contract

```ts
export *
export EntropyError
```

## Dependency Slice

```
import { ProtectedRegionMap } from '../../annotations'
import { DependencyGraph } from '../../constraints/types'
import { CloneClass, CloneIndex, DuplicationConfig, FingerprintCollision } from '../../duplication'
import { EntropyError } from '../../shared/errors'
import { AST, Export, Import, LanguageParser } from '../../shared/parsers'
import { PathAlias } from '../path-aliases'
import { ComplexityConfig, ComplexityReport } from './complexity'
import { EntropyConfig } from './config'
import { CouplingConfig, CouplingReport } from './coupling'
import { DeadCodeReport } from './dead-code'
import { DriftReport } from './drift'
import { DuplicationReport } from './duplication'
import { PatternReport } from './pattern'
import { PatternConfig, PatternMatch } from './pattern-config'
import { SizeBudgetConfig, SizeBudgetReport } from './size-budget'
import { CodebaseSnapshot, SourceFile } from './snapshot'
```
