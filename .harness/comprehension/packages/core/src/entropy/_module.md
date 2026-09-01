---
schemaVersion: 1
module: 'packages/core/src/entropy'
sourceHash: '99bdc1ae0833e32fd5c34eb6c73095654dc0e83bc0e1d8c226acd7770784e87f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'analyzer.ts',
    'entry-points.test.ts',
    'entry-points.ts',
    'index.ts',
    'path-aliases.ts',
    'snapshot.ts',
    'types.ts',
  ]
---

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
import { loadPathAliases } from './path-aliases'
import { buildSnapshot } from './snapshot'
import { AnalysisError, CodeBlock, CodeReference, CodebaseSnapshot, ComplexityReport, CouplingReport, DeadCodeReport, DocumentationFile, DriftConfig, DriftReport, EntropyConfig, EntropyError, EntropyReport, ExportMap, InlineReference, InternalSymbol, JSDocComment, PatternConfig, PatternReport, SizeBudgetReport, SourceFile, SuggestionReport, TestImportSource } from './types'
import { skipDirGlobs } from '@harness-engineering/graph'
import * as fs from 'fs'
import { minimatch } from 'minimatch'
import * as os from 'os'
import * as path, { dirname, isAbsolute, join, resolve } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
