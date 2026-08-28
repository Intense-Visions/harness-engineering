---
schemaVersion: 1
module: 'packages/core/tests/entropy'
sourceHash: '1ddc7a718c7385227602a723e2c84a08528e84a32a7d9237d9c9c4aa523c4603'
compiledAt: '2026-08-28T01:22:10.811Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  ['analyzer.behavior.test.ts', 'analyzer.test.ts', 'graph-integration.test.ts', 'snapshot.test.ts']
---

## Summary

This test suite validates **EntropyAnalyzer**, a unified tool for detecting codebase entropy across five dimensions: documentation drift, dead code, pattern violations, complexity, and coupling. The analyzer supports both standalone detector methods (detectDrift, detectDeadCode, detectPatterns) and integrated analyze() flow. A key optimization: when run in graph-enhanced mode with both `graphDriftData` and `graphDeadCodeData` supplied, it skips expensive snapshot building, relying on pre-computed reachability from the knowledge graph. Tests characterize accessor contracts, selective analyzer enablement (patterns/complexity/coupling/sizeBudget accept both boolean flags and object-form configs), snapshot reuse across detector calls, graph-skipped paths, and suggestion derivation. Every async operation returns a Result<T> envelope with an ok flag for type-safe error handling.

## Invariants

- Accessor idempotency: getReport() and getSnapshot() return undefined until analyze() completes; thereafter they return the exact same object instances that analyze() resolved with, not copies.
- Analyzer selectivity: Only enabled analyzers (drift, deadCode, patterns, complexity, coupling, sizeBudget) produce reports attached to the result; disabled ones remain absent—never null or empty stubs.
- Graph optimization gate: When both graphDriftData AND graphDeadCodeData are supplied to analyze(), snapshot building is bypassed entirely; result uses minimal empty snapshot (files: [], buildTime: 0). If only one is present, real snapshot is built.
- Snapshot singleton: ensureSnapshot() short-circuits—the same snapshot instance is reused across multiple detector calls (drift, deadCode, patterns) rather than rebuilt, reducing I/O.
- Configuration polymorphism: Analyzers (patterns, complexity, coupling, sizeBudget) accept both boolean-true (default config) and object forms (custom config); both branches must attach reports.
- Detector independence: Standalone detectX() methods build snapshots on-demand and work without analyze() being called first; they populate the analyzer's internal snapshot state as a side effect.
- Suggestions require analyzed state: getSuggestions() only produces output after analyze() has completed; calling it before analysis is a contract violation.
- Result envelope consistency: All async operations (analyze, detectDrift, detectDeadCode) return Result<T> with an ok boolean; callers must guard on ok before accessing .value.

## Interface Contract

```ts

```

## Dependency Slice

```
import { EntropyAnalyzer } from '../../src/entropy/analyzer'
import { detectDeadCode } from '../../src/entropy/detectors/dead-code'
import { detectDocDrift } from '../../src/entropy/detectors/drift'
import { buildSnapshot, parseDocumentationFile, resolveEntryPoints } from '../../src/entropy/snapshot'
import { CodebaseSnapshot, EntropyConfig } from '../../src/entropy/types'
import { TypeScriptParser } from '../../src/shared/parsers'
import { skipDirGlobs } from '@harness-engineering/graph'
import * as fs from 'node:fs'
import from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
