---
schemaVersion: 1
module: "packages/cli/src/comprehension"
sourceHash: "cf05534cfdd4e4cf662fde11c08132d7bd12097b33fabf44db929c5314fd0f6c"
compiledAt: "2026-08-29T15:45:18.532Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile-run.ts", "config.ts", "generate-semantic.ts", "hook.ts", "invalidation.ts", "regression.ts", "static-extractor.ts"]
---

## Summary

The comprehension module (`packages/cli/src/comprehension`) is the CLI driver for semantic code indexing. It compiles TypeScript modules into "comprehension units" (static interface + optional LLM-generated summaries) and stores them, providing both compilation (`runComprehend`), CI verification (`runComprehendCheck`), and token-savings reporting (`runComprehendStats`). It operates with reentrancy guards, bounded concurrency (default 4 workers), and a freshness gate that skips recompiling modules whose committed units are source-fresh and semantically sufficient. When no semantic generator is provided, units are static-only; otherwise, semantic presence is a distinct gate. The module achieves ~96% token savings via compression of served units compared to raw source.

## Invariants

- Source hash must be computed from exactly the files the reader returns; freshness check and compile-time hash must never diverge
- Timestamp (compiledAt) moves only when sourceHash moves; semantic upgrades preserve the prior timestamp to avoid git churn
- C1 skip gate: a module is skipped iff its committed unit is source-fresh AND semantically sufficient (static run needs no semantic; semantic run requires semantic:present)
- Static–semantic duality: static-only run satisfied by any unit; semantic run requires semantic:present (semantic:absent units must recompile)
- Reentrancy mutual exclusion: if a run is already active (detected via env flag), new run refuses immediately with reentrancyRefused:true
- Concurrency ceiling: peak in-flight compilations never exceed configured limit via fixed worker pool
- runComprehendCheck is token-free: never calls LLM, never writes, exits non-zero iff any unit is source-stale
- Token savings reported only for fresh units that pass serveGate; stale units' served form is not what consumers receive

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
