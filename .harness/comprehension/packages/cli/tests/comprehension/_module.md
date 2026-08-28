---
schemaVersion: 1
module: 'packages/cli/tests/comprehension'
sourceHash: '13f5b917817a4be96e8eb893c42a762da9d2d6c3e55a192292df11b25489ece0'
compiledAt: '2026-08-28T01:22:09.628Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'compile-run.test.ts',
    'comprehend-e2e.test.ts',
    'comprehend-flags.test.ts',
    'comprehend-smoke.e2e.test.ts',
    'config.test.ts',
    'generate-semantic.test.ts',
    'hook.test.ts',
    'invalidation.test.ts',
    'static-extractor.test.ts',
  ]
---

## Summary

The comprehension test suite validates a lightweight code compilation system that extracts static metadata (interface contracts, dependency slices) and optionally-semantic annotations (summaries, invariants) from TypeScript modules. The system gates on source-hash freshness to avoid redundant provider calls, supports concurrent batch compilation in `--changed` or `--all` modes, prevents recursive invocation via reentrancy guards, and tracks semantic availability (absent/present) to enable partial semantic upgrades when providers become available. Tests exercise concurrency bounding, mode-specific compilation scoping, freshness detection, provider interaction lifecycle, and serialized unit storage.

## Invariants

- Concurrency bound: peak in-flight operations across all modules must never exceed the specified concurrency limit
- Input order preservation: mapWithConcurrency must return results in the same order as input items despite async execution
- Changed-scope compilation: --changed mode recompiles exactly the module set passed via changedModules, no more
- All-scope compilation: --all mode recompiles every module returned by listModules(), reading from the enumeration source
- Reentrancy guard: runComprehend refuses to execute and returns reentrancyRefused=true when REENTRANCY_ENV is set; no writes occur
- Reentrancy flag lifecycle: the REENTRANCY_ENV flag must be set during the run (visible to generateSemantic) and restored to its prior state after
- C1 freshness gate (no re-write): a second compile over unchanged source must NOT write a new unit and must NOT call the provider
- C1 freshness gate (no provider call): generateSemantic must not be invoked for modules whose source hash matches the committed unit's hash
- C1 source-hash divergence: recompilation triggers immediately when source hash changes; the freshness gate does not block real edits
- C1 semantic upgrade path: can upgrade semantic:absent → semantic:present when hash is unchanged but generateSemantic is provided, and compiledAt is preserved
- Null-source skip: modules whose reader returns null are skipped without error; they appear in result.skipped and do not write units
- Static-only units (no provider): units compiled without a generateSemantic function have provenance.semantic='absent'
- Semantic-present units (with provider): units compiled with a generateSemantic function have provenance.semantic='present'
- Store durability: committed units written in one run are readable (via store.read) in subsequent runs without explicit commit signals

## Interface Contract

```ts

```

## Dependency Slice

```
import { createComprehendCommand, resolveChangedScope, resolveCompileProvider, resolveMode, stageCompiledUnits } from '../../src/commands/comprehend'
import { ChangedSurface } from '../../src/commands/validate-scope'
import { ComprehendRunResult, mapWithConcurrency, runComprehend, runComprehendCheck, runComprehendStats } from '../../src/comprehension/compile-run'
import { readComprehensionConfig } from '../../src/comprehension/config'
import { REENTRANCY_ENV, isComprehensionReentrant, maybeCreateGenerateSemantic } from '../../src/comprehension/generate-semantic'
import { DEFAULT_DIGEST_CHAR_BUDGET, DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_SEMANTIC_MODEL, REENTRANCY_ENV, boundSourceDigest, buildSemanticPrompt, createGenerateSemantic, isComprehensionReentrant, maybeCreateGenerateSemantic, semanticResponseSchema, withComprehensionActive } from '../../src/comprehension/generate-semantic.js'
import { shouldRunComprehendHook } from '../../src/comprehension/hook'
import { enumerateModules, filesToModules } from '../../src/comprehension/invalidation'
import { createStaticExtractor, isStaticSupported, renderDependencySlice, renderInterfaceContract } from '../../src/comprehension/static-extractor'
import { HarnessConfig, HarnessConfigSchema } from '../../src/config/schema'
import { ComprehensionListing, ComprehensionSourceFile, ComprehensionStore, ComprehensionUnit, Err, ExtractStatic, GenerateSemantic, Ok, SemanticInput, SourceFile, StaticExtraction, compileModule, computeSourceHash, createNodeComprehensionIO, createNodeModuleSourceReader, serveGate } from '@harness-engineering/core'
import { AnalysisProvider, AnalysisRequest, AnalysisResponse } from '@harness-engineering/intelligence'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as path, path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
