---
schemaVersion: 1
module: 'packages/core/tests/entropy/detectors'
sourceHash: '1d6757057eea84dc77781c03a25cfbd79bf1fa05d2506590a48908cc659f30d1'
compiledAt: '2026-08-28T01:22:10.838Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'complexity.test.ts',
    'coupling.test.ts',
    'dead-code-public-api.test.ts',
    'dead-code.test.ts',
    'drift.test.ts',
    'patterns.checkers.test.ts',
    'patterns.test.ts',
    'size-budget.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createRegionMap } from '../../../src/annotations'
import { GraphComplexityData, detectComplexityViolations } from '../../../src/entropy/detectors/complexity'
import { GraphCouplingData, detectCouplingViolations } from '../../../src/entropy/detectors/coupling'
import { buildReachabilityMap, detectDeadCode } from '../../../src/entropy/detectors/dead-code'
import { detectDocDrift, findPossibleMatches, levenshteinDistance } from '../../../src/entropy/detectors/drift'
import { checkConfigPattern, detectPatternViolations } from '../../../src/entropy/detectors/patterns'
import { detectSizeBudgetViolations, parseSize } from '../../../src/entropy/detectors/size-budget'
import { buildSnapshot } from '../../../src/entropy/snapshot'
import { CodebaseSnapshot, ComplexityConfig, ConfigPattern, CouplingConfig, DeadCodeConfig, SizeBudgetConfig, SourceFile } from '../../../src/entropy/types'
import { TypeScriptParser } from '../../../src/shared/parsers'
import { isOk } from '../../../src/shared/result'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
```
