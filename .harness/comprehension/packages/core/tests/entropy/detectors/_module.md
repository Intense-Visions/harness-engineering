---
schemaVersion: 1
module: 'packages/core/tests/entropy/detectors'
sourceHash: 'fc2ea04b3a7ae78e4c419eabf0e59b87ae25791f744c0bd108ff63d739921bdf'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'complexity.test.ts',
    'coupling.test.ts',
    'dead-code-path-alias.test.ts',
    'dead-code-public-api.test.ts',
    'dead-code.test.ts',
    'drift.test.ts',
    'duplication-registration.test.ts',
    'duplication.perf.test.ts',
    'duplication.test.ts',
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
import from '../../../src/duplication'
import { normalizeTokens } from '../../../src/duplication/tokens'
import { extractUnits } from '../../../src/duplication/units'
import { GraphComplexityData, detectComplexityViolations } from '../../../src/entropy/detectors/complexity'
import { GraphCouplingData, detectCouplingViolations } from '../../../src/entropy/detectors/coupling'
import { buildReachabilityMap, detectDeadCode } from '../../../src/entropy/detectors/dead-code'
import { detectDocDrift, findPossibleMatches, levenshteinDistance } from '../../../src/entropy/detectors/drift'
import { detectDuplication } from '../../../src/entropy/detectors/duplication'
import from '../../../src/entropy/detectors/index'
import { checkConfigPattern, detectPatternViolations } from '../../../src/entropy/detectors/patterns'
import { detectSizeBudgetViolations, parseSize } from '../../../src/entropy/detectors/size-budget'
import from '../../../src/entropy/index'
import { buildSnapshot } from '../../../src/entropy/snapshot'
import { CodebaseSnapshot, ComplexityConfig, ConfigPattern, CouplingConfig, DeadCodeConfig, SizeBudgetConfig, SourceFile } from '../../../src/entropy/types'
import { findFiles, relativePosix } from '../../../src/shared/fs-utils'
import { TypeScriptParser } from '../../../src/shared/parsers'
import { isOk } from '../../../src/shared/result'
import { memberSets, wrapper } from '../../duplication/fixtures'
import from '@harness-engineering/core'
import { skipDirGlobs } from '@harness-engineering/graph'
import { parse } from '@typescript-eslint/typescript-estree'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { minimatch } from 'minimatch'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
```
