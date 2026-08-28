---
schemaVersion: 1
module: 'packages/core/src/harness-strength'
sourceHash: '02fd827c6dc29ebf06ada32acbaacf212dea0a7d707a4ac8e39eca19294962bb'
compiledAt: '2026-08-28T01:22:10.423Z'
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
import { SEVERITY_WEIGHTS, rollupScore, tierFor } from './scoring'
import { AuditResult, AuditResultSchema, HarnessConfigSubset, HarnessConfigSubsetSchema, HookFile, Mode, ProjectContext, ProjectContextSchema, Severity, SkippedRule, StrengthFinding, StrengthFindingSchema, StrengthRule, Tier } from './types'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
```
