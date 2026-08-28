---
schemaVersion: 1
module: 'packages/core/tests/entropy/detectors'
sourceHash: '1d6757057eea84dc77781c03a25cfbd79bf1fa05d2506590a48908cc659f30d1'
compiledAt: '2026-08-28T01:22:10.838Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `packages/core/tests/entropy/detectors` module is a test suite that validates entropy detectors—static analyzers that flag code quality regressions across six dimensions: complexity (cyclomatic complexity, nesting depth, function length, parameter count), coupling (dependency violations), dead code (unreachable exports), drift (documentation staleness), patterns (architectural rules), and size budgets (file/module size caps). The tests verify that detectors correctly measure violations, apply severity tiers, respect custom thresholds, report statistics, and handle edge cases in TypeScript parsing.

## Invariants

- Cyclomatic Complexity Tiering: CC > 15 = error; 10 < CC ≤ 15 = warning; default thresholds are hardcoded and used when config is empty.
- Nesting Depth Threshold: Nesting > 4 levels raises a warning violation; measured independently of cyclomatic complexity.
- Function Length Baseline: Functions > 50 lines trigger warning; measured line-count from declaration to closing brace.
- Parameter Count Baseline: Functions with > 5 parameters raise warning; exact count is included in violation data.
- Result Type Contract: All detector functions return Result<T, E> (checked via isOk(result)); callers must validate success before accessing .value.
- Stats Accuracy: stats.filesAnalyzed and stats.functionsAnalyzed must reflect actual counts in the snapshot; miscount indicates a parsing bug.
- Graph Hotspot Scoring: Hotspot violations fire when hotspotScore > percentile95Score; severity is always 'error' for hotspots.
- File Length Severity: File length violations (default > 300 lines) report as 'info' severity, not warning/error.
- Threshold Override Mechanism: ComplexityConfig.thresholds overrides all defaults; an empty config object {} uses hardcoded defaults, not absence.
- Expression-Bodied Arrow Parsing (regression #1329): Arrow functions without braces (e.g., const inc = (n) => n + 1) must measure at their true length (1 line), not scan forward into the next function's body—this prevents inflated length metrics and downstream corruption of all per-function complexity stats.

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
