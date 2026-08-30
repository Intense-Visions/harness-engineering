---
schemaVersion: 1
module: "packages/cli/src/comprehension"
sourceHash: "bf0adc5c4ccf414a9df9ca3efbb3dc4aa395e9f1ccdf067cfae19f3547a2995d"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile-run.ts", "config.ts", "generate-semantic.ts", "hook.ts", "invalidation.ts", "regression.ts", "static-extractor.ts"]
---

## Summary

packages/cli/src/comprehension orchestrates TypeScript module semantic documentation via bounded-concurrency compilation. Its core is the freshness-gate pattern (C1): when a module's source hash matches its committed unit and semantic completeness is satisfied, it skips compilation—no recompile, no provider call, no git churn. Runs are reentrancy-guarded (env-based), support dual modes ('changed' for diff-scoped PRs, 'all' for full enumeration), and provide static-only or LLM-semantic workflows. Compilation happens under a bounded worker pool; CI gates offer token-free freshness verification (--check) and token-savings reporting (--stats).

## Invariants

- Freshness hash is canonical: sourceHash in C1 checks must come from exact files the reader returns, never diverging from compile-time hash
- Reentrancy is enforceable: withComprehensionActive + env check must prevent overlapping runs; reentrant entry aborts with reentrancyRefused:true
- Token budget is shared per-run: semantic generator closure holds the budget; all module compilations in one run draw from same pool
- Force-recompile is byte-stable: no wall-clock or randomness in output; identical source always produces identical bytes (ADR 0109)
- Fresh modules never re-write: C1-skipped modules produce no write; they appear only in 'fresh' list, not 'compiled' or 'skipped'
- CI check never calls LLM: runComprehendCheck is token-free; it uses reader+serveGate to report stale units and exits non-zero iff any stale
- Stats count only fresh units: token estimates include only modules passing serveGate; stale units excluded from savings calculations
- Static-only runs need no semantic: without generateSemantic, units compile to semantic:absent; C1 allows reuse in subsequent static-only runs

## Interface Contract

```ts
export DEFAULT_DIGEST_CHAR_BUDGET
export DEFAULT_MAX_OUTPUT_TOKENS
export DEFAULT_SEMANTIC_MODEL
export REENTRANCY_ENV
export STATIC_SUPPORTED_EXTENSIONS
export boundSourceDigest
export buildSemanticPrompt
export comprehensionEndpoint
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
export selectSemanticModel
export semanticResponseSchema
export shouldRunComprehendHook
export withComprehensionActive
```

## Dependency Slice

```
import { ComprehensionConfig, ComprehensionConfigSchema, HarnessConfig } from '../config/schema'
import { AnalysisEndpoint, ProviderKind, resolveProviderKind } from '../mcp/utils/analysis-provider'
import { readComprehensionConfig } from './config'
import { defaultSemanticModel, isComprehensionReentrant, withComprehensionActive } from './generate-semantic'
import { COMPREHENSION_ROOT, ComprehensionListing, ComprehensionProvenance, ComprehensionSourceFile, ComprehensionUnit, DEFAULT_SOURCE_EXTENSIONS, ExtractStatic, GenerateSemantic, Result, SemanticGeneration, SemanticInput, SkippedUnit, StaticExtraction, TypeScriptParser, compileModule, computeSourceHash, estimateTokens, renderServedUnit, serveGate } from '@harness-engineering/core'
import { AnalysisProvider } from '@harness-engineering/intelligence'
import { spawnSync } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
```
