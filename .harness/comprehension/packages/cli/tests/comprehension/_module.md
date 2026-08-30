---
schemaVersion: 1
module: "packages/cli/tests/comprehension"
sourceHash: "322ee37b461748bb6286b47033ef0af1f7ee88660246da3c3b3f1215e718fc27"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile-run.test.ts", "comprehend-e2e.test.ts", "comprehend-flags.test.ts", "comprehend-smoke.e2e.test.ts", "config.test.ts", "generate-semantic.test.ts", "hook.test.ts", "invalidation.test.ts", "regression.test.ts", "static-extractor.test.ts"]
---

## Summary

The `packages/cli/tests/comprehension` module validates the semantic-comprehension compiler pipeline—static code analysis (interfaces, dependencies) plus optional LLM summarization. Five core test suites: compile-run (units write to store, provider optionality), generate-semantic (LLM interaction & reentrancy), regression (semantic state tracking across refs), invalidation (file→module mapping for --changed/--all modes), and CLI integration (command modes, precedence, e2e). Complementary tests cover pre-commit hook gating (static-only, opt-in), config schema, and static extraction. Tests use fake stores/readers/providers throughout for hermetic isolation.

## Invariants

- C1 — Fresh units never re-run: unchanged source must not rewrite units or re-invoke the provider; hash mismatch or semantic-upgrade (absent→present, same hash) does trigger recompile
- SC3 — Changed mode precision: --changed compiles exactly the changed-module set (files → owning directories); git failure falls back to --all with warning
- SC4 — Static-only by design: pre-commit hook always runs --static regardless of config; semantic is opt-in via explicit generateSemantic argument
- ADR 0109 — Byte-stable provenance: semantic-only upgrades never write compiledAt wall-clock; static provenance immutable across semantic tiers
- Concurrency bounded: peak in-flight async operations ≤ concurrency parameter (provider calls, static extraction, writes)
- Reentrancy guarded: env flag (REENTRANCY_ENV) set during run; nested calls refuse to compile; flag restored after run even on error
- Source reader nullability: modules returning null (deleted directories) skipped with no error; not written, not recompiled
- --check token-free: freshness verification compares committed hashes vs live readers; no LLM call, no cost beyond I/O

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
