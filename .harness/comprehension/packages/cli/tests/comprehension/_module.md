---
schemaVersion: 1
module: "packages/cli/tests/comprehension"
sourceHash: "0c3cb5408e7c72d3789dd87f19d877c4c4a0102aeabc2fa0308b6eaf7cbbdaa5"
compiledAt: "2026-08-29T15:27:03.411Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile-run.test.ts", "comprehend-e2e.test.ts", "comprehend-flags.test.ts", "comprehend-smoke.e2e.test.ts", "config.test.ts", "generate-semantic.test.ts", "hook.test.ts", "invalidation.test.ts", "static-extractor.test.ts"]
---

## Summary

The `packages/cli/tests/comprehension` module tests the committed semantic comprehension pipeline — an effortless system that extracts static code information (interfaces, dependencies) and optionally generates LLM-powered semantic summaries. The test suite validates three phases: (1) Compilation with source-hash freshness detection and concurrency bounding (changed vs. all modes); (2) Configuration ensuring config-declared endpoints don't get mismatched models; (3) Semantic generation with reentrancy barriers and schema validation. The pipeline stays fresh in PRs via static-only pre-commit hooks (zero CI tokens), with CI verification and merge drivers wiring provider-neutral endpoints. Nine test files cover compile-run, config, semantic generation, flags, invalidation, static extraction, hooks, and e2e scenarios.

## Invariants

- C1 (Fresh units never re-run): Unchanged source must skip recompile, never re-invoke the LLM provider, and never rewrite the unit. Source hash is the gate.
- SC3 (Changed mode precision): --changed recompiles exactly the changed-module set, no more, no fewer.
- SC4 (Static-only defaults): Without a generateSemantic function, units are semantic: absent — zero provider interaction.
- Reentrancy flag lifecycle: Set during run, restored after (prevents nested LLM calls via env var).
- Concurrency boundary: Peak in-flight tasks ≤ configured limit; preserves input order.
- Semantic upgrade invariant: When upgrading semantic: absent → present with unchanged source hash, compiledAt is preserved (C1 belt).
- Config/model coupling (ADR 0109 slice 3): Config-declared analysisBaseUrl overrides provider-based model selection; cannot force claude-haiku onto a vendor endpoint.
- Hook is static-only (SF1.3): Pre-commit hook always passes --static regardless of comprehension.semantic config; opt-in via hook: true + storage: committed.
- Null source skips gracefully: Module with null reader result is skipped (no throw), reported in result.skipped.
- Check/stats are token-free: runComprehendCheck and runComprehendStats operate on committed units without provider calls.

## Interface Contract

```ts

```

## Dependency Slice

```
import { createComprehendCommand, resolveChangedScope, resolveCompileProvider, resolveMode, stageCompiledUnits } from '../../src/commands/comprehend'
import { ChangedSurface } from '../../src/commands/validate-scope'
import { ComprehendRunResult, mapWithConcurrency, runComprehend, runComprehendCheck, runComprehendStats } from '../../src/comprehension/compile-run'
import { comprehensionEndpoint, readComprehensionConfig, selectSemanticModel } from '../../src/comprehension/config'
import { REENTRANCY_ENV, isComprehensionReentrant, maybeCreateGenerateSemantic } from '../../src/comprehension/generate-semantic'
import { DEFAULT_DIGEST_CHAR_BUDGET, DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_SEMANTIC_MODEL, REENTRANCY_ENV, boundSourceDigest, buildSemanticPrompt, createGenerateSemantic, defaultSemanticModel, isComprehensionReentrant, maybeCreateGenerateSemantic, semanticResponseSchema, withComprehensionActive } from '../../src/comprehension/generate-semantic.js'
import { shouldRunComprehendHook } from '../../src/comprehension/hook'
import { enumerateModules, filesToModules } from '../../src/comprehension/invalidation'
import { createStaticExtractor, isStaticSupported, renderDependencySlice, renderInterfaceContract } from '../../src/comprehension/static-extractor'
import { ComprehensionConfigSchema, HarnessConfig, HarnessConfigSchema } from '../../src/config/schema'
import { ComprehensionListing, ComprehensionSourceFile, ComprehensionStore, ComprehensionUnit, Err, ExtractStatic, GenerateSemantic, Ok, SemanticInput, SourceFile, StaticExtraction, compileModule, computeSourceHash, createNodeComprehensionIO, createNodeModuleSourceReader, serveGate } from '@harness-engineering/core'
import { AnalysisProvider, AnalysisRequest, AnalysisResponse } from '@harness-engineering/intelligence'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as path, path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
