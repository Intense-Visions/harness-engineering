---
schemaVersion: 1
module: "packages/cli/src/comprehension"
sourceHash: "a7347e7649abec4ba2e0974c2ea5d55de8b489daf9aea5497b17e128c1a8a8bc"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile-run.ts", "config.ts", "generate-semantic.ts", "hook.ts", "invalidation.ts", "regression.ts", "static-extractor.ts"]
---

## Summary

`packages/cli/src/comprehension` is the CLI-side driver for compiled-comprehension unit compilation, freshness verification, and statistics reporting. It orchestrates three main flows: (1) `runComprehend` compiles modules (changed or all) with optional semantic enrichment via a shared LLM budget, writing fresh units to a store and skipping already-fresh units to avoid git churn; (2) `runComprehendCheck` is a token-free CI gate that recomputes sourceHash for every committed unit without touching an LLM; (3) `runComprehendStats` reports raw vs. served token estimates and savings. All runs are gated by reentrancy control to prevent nested executions. Modules compile under bounded concurrency with a per-run token budget shared across the pool. Without a `generateSemantic` provider, units degrade to static-only (SC4).

## Invariants

- Freshness compute is canonical: sourceHash derived from exactly the files the compile would read (the canonical reader's output), so the freshness gate never diverges from actual compile-time hash.
- Fresh units never re-run: When a committed unit's sourceHash matches and is semantically sufficient for the run, skip the entire compile/write cycle—no provider cost, no git churn.
- Reentrancy is atomic: A run in progress refuses any new entry; no nested comprehension runs are possible.
- Token budget is shared: The per-run LLM budget lives in the generateSemantic closure and is spent across all concurrent module compiles.
- Static-only is safe fallback: Without a semantic provider, units emit semantic:absent and remain usable downstream; degradation is graceful.
- CI check is LLM-free: runComprehendCheck never calls an analysis provider, making it cheap and safe as a CI gate.
- Order preservation: mapWithConcurrency preserves input module order in results despite bounded concurrent processing.

## Interface Contract

```ts
export DEFAULT_DIGEST_CHAR_BUDGET
export DEFAULT_MAX_OUTPUT_TOKENS
export DEFAULT_SEMANTIC_MODEL
export REENTRANCY_ENV
export STATIC_SUPPORTED_EXTENSIONS
export boundSourceDigest
export buildSemanticPrompt
export createGenerateSemantic
export createStaticExtractor
export defaultRefReadDeps
export defaultSemanticModel
export detectSemanticRegressions
export enumerateModules
export filesToModules
export isComprehensionReentrant
export isStaticSupported
export mapWithConcurrency
export maybeCreateGenerateSemantic
export parseModuleSemantic
export readComprehensionConfig
export readSemanticMapAtRef
export renderDependencySlice
export renderInterfaceContract
export runComprehend
export runComprehendCheck
export runComprehendStats
export semanticResponseSchema
export shouldRunComprehendHook
export withComprehensionActive
```

## Dependency Slice

```
import { ComprehensionConfig, ComprehensionConfigSchema, HarnessConfig } from '../config/schema'
import { ProviderKind } from '../mcp/utils/analysis-provider'
import { readComprehensionConfig } from './config'
import { isComprehensionReentrant, withComprehensionActive } from './generate-semantic'
import { COMPREHENSION_ROOT, ComprehensionListing, ComprehensionProvenance, ComprehensionSourceFile, ComprehensionUnit, DEFAULT_SOURCE_EXTENSIONS, ExtractStatic, GenerateSemantic, Result, SemanticGeneration, SemanticInput, SkippedUnit, StaticExtraction, TypeScriptParser, compileModule, computeSourceHash, estimateTokens, renderServedUnit, serveGate } from '@harness-engineering/core'
import { AnalysisProvider } from '@harness-engineering/intelligence'
import { spawnSync } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
```
