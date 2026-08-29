---
schemaVersion: 1
module: "packages/cli/tests/comprehension"
sourceHash: "5118f7c3c9f6a085eeb2b367f04b39c80b0cddd1738d95c1a064ad3b73a20139"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile-run.test.ts", "comprehend-e2e.test.ts", "comprehend-flags.test.ts", "comprehend-smoke.e2e.test.ts", "config.test.ts", "generate-semantic.test.ts", "hook.test.ts", "invalidation.test.ts", "static-extractor.test.ts"]
---

## Summary

The `packages/cli/tests/comprehension` module tests the core compilation, caching, and LLM-driven semantic analysis pipeline that builds module comprehension artifacts.

**compile-run.test.ts** validates the orchestration engine: `runComprehend()` compiles modules in `--changed` or `--all` mode, with concurrency bounds, source-hash-based freshness checks, and optional LLM semantic generation. Fresh modules (source unchanged) skip recompilation and provider calls entirely (C1 invariant). `runComprehendCheck()` and `runComprehendStats()` provide token-free CI verification and token-savings metrics. Reentrancy guards prevent nested invocations.

**generate-semantic.test.ts** tests the semantic layer: `createGenerateSemantic()` wraps an LLM provider, enforces per-run token budgets (fail-loud), validates schema via `semanticResponseSchema`, and bounds source input via `boundSourceDigest()`. `withComprehensionActive()` gates concurrent sibling calls safely. Graceful degradation: malformed LLM output or provider errors return null (logged once), never abort.

**comprehend-flags.test.ts** tests CLI integration: `--static` forces static-only (no provider resolution, semantic:absent units); `--stage` git-adds compiled shard paths after prettier formatting. Hook posture (changed-scope derivation fails → skip, don't full-sweep).

**static-extractor.test.ts** tests AST-based static analysis: `renderInterfaceContract()` and `renderDependencySlice()` extract the public surface and import footprint, barrel-aware, language-typed (TS/JS only, degrades gracefully for unsupported languages).

The test suite anchors on ADR 0109 (effortless, agent-neutral comprehension): byte-stable static provenance, semantic upgrades that don't churn, provider-neutral routing, and in-PR generation without CI tokens.

## Invariants

- C1 (Freshness Cache): Source hash unchanged → skip recompile and provider call; hash mismatch forces recompile. Units written only on source change or semantic upgrade.
- Reentrancy Guard: REENTRANCY_ENV flag set during run, restored after. Prevents silent drops under concurrent sibling calls; withComprehensionActive() enforces it.
- Semantic Upgrade (ADR 0109): Absent→Present transition recompiles WITHOUT updating sourceHash or compiledAt (byte-stable static provenance). Pure semantic rewrites preserve build artifact identity.
- Provider-Neutral: No forced Claude model in semantic requests; respects HARNESS_ANALYSIS_MODEL. Resolver returns null when semantic disabled; maybeCreateGenerateSemantic() returns undefined.
- Token Budget (Per-Run, Fail-Loud): Exhausted budget short-circuits provider calls, logs once, returns null. Missing usage from provider triggers pessimistic floor charge + one-time warn.
- Concurrency Ceiling: mapWithConcurrency() and runComprehend(concurrency) bound in-flight tasks. Peak in-flight never exceeds limit. Preserved input order.
- Static-Only Posture (--static / SC4): No provider ever resolved. Units emit semantic:absent, sourceHash set, no model. Never triggers provider interaction.
- Graceful Degradation: Malformed LLM schema, provider errors, or LLM throws → null result, log once, continue (never abort). Extra keys stripped from LLM response, no warn.
- --Stage Shard Formatting: Compiled units prettier-formatted BEFORE git-add so unformatted shards never trip whole-tree format:check.
- Language-Typed AST: isStaticSupported() returns false for non-TS/JS; renderInterfaceContract/dependencySlice degrade to empty strings (never faked).

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
