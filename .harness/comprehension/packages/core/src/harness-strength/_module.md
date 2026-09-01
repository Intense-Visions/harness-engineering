---
schemaVersion: 1
module: 'packages/core/src/harness-strength'
sourceHash: 'dddc5a1988f545a96117e4c11c845958cce3968da7687552aed00ea5d31e4484'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'auditor.test.ts',
    'auditor.ts',
    'context.test.ts',
    'context.ts',
    'index.ts',
    'partial-coverage-score.1761.test.ts',
    'scoring.test.ts',
    'scoring.ts',
    'types.test.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export *
export ALL_RULES
export AuditOptions
export HarnessStrengthAuditor
export ModeOptions
export SEVERITY_WEIGHTS
export buildProjectContext
export resolveMode
export rollupScore
```

## Dependency Slice

```
import { Err, Ok, Result, isOk } from '../shared/result'
import { HarnessStrengthAuditor } from './auditor'
import { ModeOptions, buildProjectContext, resolveMode } from './context'
import { ALL_RULES } from './rules/index'
import { SEVERITY_WEIGHTS, rollupScore, scoreWithCoverage, tierFor } from './scoring'
import { AuditResult, AuditResultSchema, HarnessConfigSubset, HarnessConfigSubsetSchema, HookFile, Mode, ProjectContext, ProjectContextSchema, Severity, SkippedRule, StrengthFinding, StrengthFindingSchema, StrengthRule, Tier } from './types'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
```
