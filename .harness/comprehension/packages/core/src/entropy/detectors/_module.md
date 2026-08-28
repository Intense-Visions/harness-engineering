---
schemaVersion: 1
module: 'packages/core/src/entropy/detectors'
sourceHash: '4825517357f64b3abe7e00444f90a9c053d4c22c2e84d9adbdeb0331a696ab4c'
compiledAt: '2026-08-28T01:22:10.368Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `packages/core/src/entropy/detectors` module implements six independent detectors (complexity, coupling, dead code, doc drift, pattern, size budget) that analyze a `CodebaseSnapshot` to produce severity-stratified violation reports. Each detector follows an async `(snapshot, config?) → Result<Report, EntropyError>` contract. The complexity detector—the most substantial—extracts functions via regex + brace-counting (intentional for handling expression-bodied arrows per #1329), then rates each on cyclomatic complexity (decision-point counting), nesting depth, line count, parameter count, and optional graph-derived hotspot scores. Violations are tiered (tier-1: hotspot/cyclomatic errors; tier-2: function metrics; tier-3: file-level) and severity-stratified (error/warning/info). Detectors are independent; callers compose them and merge results.

## Invariants

- Function extraction is regex + brace-count, not AST—intentional to handle expression-bodied arrow functions correctly (issue #1329); brace-counting must skip the function-body opening brace and terminate on `;` for expression-only functions.
- Cyclomatic complexity double-counts 'else if' (both 'if' and 'else if' patterns match); deduplication requires explicit subtraction per occurrence.
- Nesting depth is measured inside the function body only—the opening '{' of the function itself must be skipped.
- Thresholds merge user config over defaults via stripUndefined(); omitted keys inherit defaults, never become zero.
- Violations are tiered independently of severity: tier-1 (hotspot + cyclomatic errors), tier-2 (function metrics), tier-3 (file-level); severity is used for filtering summary counts.
- Silent error handling on file not found—missing files in the snapshot produce no violations for that path and do not crash the detector.
- Graph data is optional; complexity detector accepts GraphComplexityData for percentile-based hotspot scoring; missing graph means no hotspot violations but other metrics still fire.
- Snapshot processing is linear per detector; detectors are not interdependent, so callers must invoke each separately and merge results.

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
