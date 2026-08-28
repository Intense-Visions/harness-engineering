---
schemaVersion: 1
module: 'packages/core/src/entropy'
sourceHash: 'a1db79d89d050afd9be3d91cc218d917f220fc9b01272fed7ce4b1dc7ebe8493'
compiledAt: '2026-08-28T01:22:10.350Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['analyzer.ts', 'entry-points.test.ts', 'entry-points.ts', 'index.ts', 'snapshot.ts', 'types.ts']
---

## Summary

`packages/core/src/entropy` is a codebase health analyzer that detects six categories of degradation: documentation drift, dead code (exports/files/imports), pattern violations, complexity hotspots, coupling issues, and size budget overruns. The core class is `EntropyAnalyzer`, which orchestrates independent detector functions and produces a unified report. It builds a snapshot of your codebase (AST-based exports, imports, symbols, docs) and runs configurable detectors against it. Key design: detectors can accept optional graph data (from `@harness-engineering/graph`) to replace or augment snapshot analysis, and errors from individual detectors don't fail the whole run—they're accumulated in the report. Analysis is modular (each detector is independent), typed with a `Result<T, E>` pattern, and supports protected regions to exclude certain code from dead-code analysis.

## Invariants

- Snapshot must exist before detectors run — detectDrift(), detectDeadCode(), and detectPatterns() call ensureSnapshot() internally; calling them before analyze() or buildSnapshot() will trigger a blocking build.
- Graph data is optional but targeted — graphOptions provides domain-specific data (drift edges, reachable nodes, hotspots, fan-in/out) to individual detectors; snapshot-building is skipped entirely if graph data covers all requested analyzers, so graph integration is an optimization path, not a fallback.
- Parser selection is per-file, not global — When config.parser is omitted, the snapshot builder dispatches to the default multi-language registry per source file; explicitly passing a parser forces single-language semantics.
- Detectors run independently and errors accumulate — Individual detector failures don't halt the pipeline; errors are pushed to analysisErrors[] and the report continues with partial data (e.g., drift may fail but dead-code runs anyway).
- Report structure is sparse — Optional report fields (report.drift, report.deadCode, etc.) are only added to the report if the corresponding analyzer ran and succeeded; downstream code must check for field existence.
- Protected regions exclude findings from dead-code — config.protectedRegions must be parsed and passed to detectDeadCode(); code marked as protected won't appear in dead-export or dead-import reports.
- Suggestions require specific report data — getSuggestions() expects deadCode, drift, and patterns reports to exist; returns empty suggestions if the report is missing or was never built.
- Summary statistics are calculated, not aggregated from external sources — Issue counts, error/warning counts, and fixable counts are derived from violation arrays in individual reports, not stored separately.

## Interface Contract

```ts
export AnnotationIssue
export AnnotationIssueType
export CleanupFinding
export CodeBlock
export CodePattern
export CodeReference
export CodebaseSnapshot
export CommentedCodeBlock
export ComplexityConfig
export ComplexityReport
export ComplexityThresholds
export ComplexityViolation
export ConfigPattern
export CouplingConfig
export CouplingReport
export CouplingThresholds
export CouplingViolation
export DeadCodeConfig
export DeadCodeReport
export DeadExport
export DeadFile
export DeadInternal
export DocumentationDrift
export DocumentationFile
export DriftConfig
export DriftReport
export EntropyAnalyzer
export EntropyConfig
export EntropyConfigSchema
export EntropyError
export EntropyReport
export ExportMap
export Fix
export FixConfig
export FixResult
export FixType
export ForbiddenImportViolation
export GraphComplexityData
export GraphCouplingData
export HotspotContext
export InlineReference
export InternalSymbol
export JSDocComment
export OrphanedDep
export PatternConfig
export PatternConfigSchema
export PatternMatch
export PatternReport
export PatternViolation
export ProtectedRegion
export ProtectedRegionMap
export ProtectionScope
export ReachabilityNode
export SafetyLevel
export SizeBudgetConfig
export SizeBudgetReport
export SizeBudgetViolation
export SourceFile
export Suggestion
export SuggestionReport
export UnusedImport
export VALID_SCOPES
export applyFixes
export applyHotspotDowngrade
export buildSnapshot
export classifyFinding
export createCommentedCodeFixes
export createFixes
export createForbiddenImportFixes
export createOrphanedDepFixes
export createRegionMap
export deduplicateCleanupFindings
export detectComplexityViolations
export detectCouplingViolations
export detectDeadCode
export detectDocDrift
export detectPatternViolations
export detectSizeBudgetViolations
export generateSuggestions
export markProtectedFindings
export parseFileRegions
export parseProtectedRegions
export parseSize
export previewFix
export validatePatternConfig
```

## Dependency Slice

```
import { buildDependencyGraph } from '../constraints/dependencies'
import { createEntropyError } from '../shared/errors'
import { fileExists, findFiles, readFileContent, relativePosix } from '../shared/fs-utils'
import { AST, Export, LanguageParser, getDefaultRegistry } from '../shared/parsers'
import { Err, Ok, Result } from '../shared/result'
import { detectComplexityViolations } from './detectors/complexity'
import { detectCouplingViolations } from './detectors/coupling'
import { detectDeadCode } from './detectors/dead-code'
import { detectDocDrift } from './detectors/drift'
import { detectPatternViolations } from './detectors/patterns'
import { detectSizeBudgetViolations } from './detectors/size-budget'
import { resolveEntryPoints } from './entry-points'
import { generateSuggestions } from './fixers/suggestions'
import { buildSnapshot } from './snapshot'
import { AnalysisError, CodeBlock, CodeReference, CodebaseSnapshot, ComplexityReport, CouplingReport, DeadCodeReport, DocumentationFile, DriftConfig, DriftReport, EntropyConfig, EntropyError, EntropyReport, ExportMap, InlineReference, InternalSymbol, JSDocComment, PatternConfig, PatternReport, SizeBudgetReport, SourceFile, SuggestionReport, TestImportSource } from './types'
import { skipDirGlobs } from '@harness-engineering/graph'
import * as fs from 'fs'
import { minimatch } from 'minimatch'
import * as os from 'os'
import * as path, { join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
