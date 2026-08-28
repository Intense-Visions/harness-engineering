---
schemaVersion: 1
module: 'packages/cli/src/comprehension'
sourceHash: 'e8b873afc38d8bc429180aea76c4b64deff63aa0858c19ea6d18559c5fc89627'
compiledAt: '2026-08-28T01:22:08.918Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'compile-run.ts',
    'config.ts',
    'generate-semantic.ts',
    'hook.ts',
    'invalidation.ts',
    'static-extractor.ts',
  ]
---

## Summary

`packages/cli/src/comprehension` is the compiled-comprehension substrate for the harness — a modular system that generates static and semantic summaries of code modules for LLM-free serving or rich analysis. Given a set of modules (changed files or all), it compiles each under bounded concurrency. Each compile produces a `ComprehensionUnit` with static metadata (interface contract, dependency slice via AST parsing) and optional semantic content (LLM-generated summary + invariants). The **C1 freshness gate** skips recompile if the module's source hash matches the committed unit AND semantic requirements are satisfied—eliminating churn on push/CI/serve paths. Architecture is strictly IO-injected for testability; the static extractor parses TypeScript/JavaScript AST; the semantic half is an LLM adapter with tight cost controls (bounded prompt, cheap default model, per-run token budget, `disableThinking`). Authority-in-TS: provider output is re-validated against Zod schema at the seam; failures degrade to `semantic:absent`, never partial. Reentrancy is a run-boundary concern via env flag—nested `claude` children are refused, but in-process concurrent siblings within the run proceed. Hook (pre-commit, opt-in, static-only) and check/stats (token-free CI backstop) complete the tooling.

## Invariants

- Freshness is canonical: sourceHash computed from EXACTLY the files the canonical reader returns — divergence between freshness check and compile is fatal
- C1 semantic sufficiency: A unit is reusable only if hash matches AND (run is static-only OR unit has semantic:present). A semantic:absent unit must recompile to add semantic
- Timestamp preservation on upgrade: When source unchanged (hash collision), compiledAt carries forward from prior unit — never moves unless sourceHash moves
- Authority-in-TS at the seam: Provider output re-validated against semanticResponseSchema at CLI→provider boundary; Zod parsing failure → null + log, never corrupts unit
- Per-run budget is shared state: Token spend across all modules enforced from RETURNED tokenUsage.totalTokens; when provider omits usage, pessimistic floor (maxOutputTokens per call) charged so budget converges
- Reentrancy is run-boundary, not per-call: withComprehensionActive sets HARNESS_COMPREHENSION_ACTIVE for whole run's duration; per-module seam never checks/sets/clears. Concurrent siblings proceed; cross-process nesting refused
- Input bounded by static surface, not module size: Prompt = interface contract + dependency slice + bounded digest (12K chars default). Digest truncation hard-capped; marker appended only if it fits budget
- Graceful degradation non-negotiable: parse failure, provider miss, budget exhausted, write error → module degraded to lower tier, never partial, never fake, never fatal
- Force-recompile preserves identity: force:true bypasses C1 gate but still preserves compiledAt on hash collision — no git churn on semantic upgrades of unchanged source
- Order preserved despite parallelism: mapWithConcurrency maintains input order in results despite bounded worker pool; aggregation reflects input sequence
- Static extraction non-recursive: Only visits passed sourceFiles (canonical D3 member set); interface barrel-anchored on index.\*, else union of all exports; empty input → empty contract
- Hook runs static-only on commit path: --static flag bypasses provider resolution; pre-commit substrate never LLM-backed, so commits never require credentials or API calls

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
export enumerateModules
export filesToModules
export isComprehensionReentrant
export isStaticSupported
export mapWithConcurrency
export maybeCreateGenerateSemantic
export readComprehensionConfig
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
import { readComprehensionConfig } from './config'
import { isComprehensionReentrant, withComprehensionActive } from './generate-semantic'
import { ComprehensionListing, ComprehensionProvenance, ComprehensionSourceFile, ComprehensionUnit, DEFAULT_SOURCE_EXTENSIONS, ExtractStatic, GenerateSemantic, Result, SemanticGeneration, SemanticInput, SkippedUnit, StaticExtraction, TypeScriptParser, compileModule, computeSourceHash, estimateTokens, renderServedUnit, serveGate } from '@harness-engineering/core'
import { AnalysisProvider } from '@harness-engineering/intelligence'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
```
