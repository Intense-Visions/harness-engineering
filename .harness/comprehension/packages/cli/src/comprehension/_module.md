---
schemaVersion: 1
module: "packages/cli/src/comprehension"
sourceHash: "bd25aa0f02ad6c7726b7a0fae07ac0f839434c27324efec360dfe204b7cfb82d"
compiledAt: "2026-08-29T15:27:03.348Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile-run.ts", "config.ts", "generate-semantic.ts", "hook.ts", "invalidation.ts", "static-extractor.ts"]
---

## Summary

The `packages/cli/src/comprehension` module orchestrates semantic comprehension of TypeScript/JavaScript modules—LLM-powered summaries paired with static AST analysis. It compiles changed or full module sets into committed units containing: static exports/imports (via AST), semantic summaries + invariants (LLM, cost-bounded), and token accounting. Five files coordinate: `compile-run.ts` drives compilation with a freshness gate and bounded concurrency; `generate-semantic.ts` wraps an LLM provider with budget enforcement and graceful degradation; `config.ts` resolves provider endpoints and models; `hook.ts` gates the pre-commit step (static-only); `invalidation.ts` maps diffs to affected modules; `static-extractor.ts` parses TypeScript/JavaScript exports/imports via AST. The system enforces run-boundary reentrancy guards (preventing nested `claude` calls), input bounding (interface + dependencies + truncated source), per-run token budgets, and provider-neutral model routing.

## Invariants

- C1 Freshness Gate: isReusableFresh() requires both source hash equality AND semantic sufficiency; a semantic:absent unit must recompile in semantic runs.
- RUN-Boundary Reentrancy: withComprehensionActive() wraps the entire run and sets HARNESS_COMPREHENSION_ACTIVE; only cross-process nesting is guarded, not in-process concurrency.
- Authority-in-TS: Semantic response validation at the seam via .strip() schema; malformed responses degrade to null (static-only), never partial or malformed.
- Input Bounding: Prompt is capped by interface contract + dependency slice + 12k-char source digest; input tokens are bounded by public surface, not module size.
- Per-Run Token Budget: Enforced from returned tokenUsage.totalTokens; exhaustion leaves remaining modules semantic:absent (never partial); provider-omitted usage charges a pessimistic floor.
- Provider-Neutral Model Routing: selectSemanticModel() resolves model using the same endpoint as the provider; Claude-family providers get claude-haiku-4-5, OpenAI-compatible get undefined (provider's own default).
- Static-Only Hook: Pre-commit hook always passes --static, bypassing provider and credential entirely (SC4).
- Module Membership (D3): Directory is a module iff its DIRECT children include ≥1 supported-extension file (non-recursive); root-level files are excluded.
- Barrel-Anchored Surface: Public interface rooted at index.* when present, else union of members' exports; empty (never faked) for unsupported languages.
- IO-Injected, Testable: ComprehendModuleReader and ComprehendUnitStore abstractions enable unit testing with in-memory fakes.

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
export defaultSemanticModel
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
import { ComprehensionListing, ComprehensionProvenance, ComprehensionSourceFile, ComprehensionUnit, DEFAULT_SOURCE_EXTENSIONS, ExtractStatic, GenerateSemantic, Result, SemanticGeneration, SemanticInput, SkippedUnit, StaticExtraction, TypeScriptParser, compileModule, computeSourceHash, estimateTokens, renderServedUnit, serveGate } from '@harness-engineering/core'
import { AnalysisProvider } from '@harness-engineering/intelligence'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
```
