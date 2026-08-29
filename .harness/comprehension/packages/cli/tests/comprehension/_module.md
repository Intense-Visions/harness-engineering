---
schemaVersion: 1
module: "packages/cli/tests/comprehension"
sourceHash: "3e5fe197935b0dac11ccb333833074de46219619c68517b20a879279aed77342"
compiledAt: "2026-08-29T15:45:18.555Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile-run.test.ts", "comprehend-e2e.test.ts", "comprehend-flags.test.ts", "comprehend-smoke.e2e.test.ts", "config.test.ts", "generate-semantic.test.ts", "hook.test.ts", "invalidation.test.ts", "regression.test.ts", "static-extractor.test.ts"]
---

## Summary

The `packages/cli/tests/comprehension` module tests a three-path semantic-comprehension pipeline: static extraction (AST-driven interface + dependencies, always runs), optional semantic synthesis (provider-based summaries with concurrency/budget bounds), and CI regression detection (git-based freshness). Tests enforce source-hash caching (C1), changed-module precision (SC3), static-by-default (SC4), provider-neutral semantics (SC5), token budgeting (SC6), and reentrancy guards to prevent nested LLM calls from collapsing results.

## Invariants

- C1: Source-hash freshness gate prevents re-work and provider re-invocation; semantic:absent→present upgrades preserve compiledAt timestamp when hash unchanged
- SC3: Changed-module precision maps files to owning dirs, normalizes to posix, deduplicates, excludes root files and non-source extensions
- SC4: Static-only by default when no semantic provider supplied; pre-commit hook always passes --static regardless of config
- SC5: Provider-neutral semantic; model optional (undefined defers to provider), response validation is schema-based, extra keys stripped not rejected, malformed→null without throw
- SC6: Token savings metric caps prompt input by configurable char budget; over-budget input truncated with marker [source truncated for comprehension digest]
- Concurrency bounding enforced per-run; peak in-flight never exceeds configured limit; concurrent siblings under withComprehensionActive all reach provider with zero silent drops
- Reentrancy refusal: pre-set flag causes runComprehend to refuse compilation and return reentrancyRefused:true; flag scoped to run duration and restored after (even on throw)
- Regression detection: present→absent is flagged as regression; absent→present/deleted/new modules are not; missing refs return null (not empty map) to distinguish unresolved from empty
- Source reader resiliency: null return (directory deleted) is silently skipped with no throw; only modules with available source are compiled and written
- Static extraction determinism: interface exports sorted (uppercase first), deduplicated by name; dependency slice groups by source sorted, one per source; empty surfaces are empty strings; barrel-anchored extraction unions only re-exports from index.ts

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
import { DEFAULT_DIGEST_CHAR_BUDGET, DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_SEMANTIC_MODEL, REENTRANCY_ENV, boundSourceDigest, buildSemanticPrompt, createGenerateSemantic, defaultSemanticModel, isComprehensionReentrant, maybeCreateGenerateSemantic, semanticResponseSchema, withComprehensionActive } from '../../src/comprehension/generate-semantic.js'
import { shouldRunComprehendHook } from '../../src/comprehension/hook'
import { enumerateModules, filesToModules } from '../../src/comprehension/invalidation'
import { RefReadDeps, SemanticState, detectSemanticRegressions, parseModuleSemantic, readSemanticMapAtRef } from '../../src/comprehension/regression'
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
