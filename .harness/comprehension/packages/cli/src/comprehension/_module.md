---
schemaVersion: 1
module: "packages/cli/src/comprehension"
sourceHash: "1dba4a527ebb783f384aa1666e6da3e6165201dae3e36f511bcc80b8fc9b0ebe"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile-run.ts", "config.ts", "generate-semantic.ts", "hook.ts", "invalidation.ts", "static-extractor.ts"]
---

## Summary

The `packages/cli/src/comprehension` module orchestrates compiled module comprehension—extracting static interface contracts and optionally generating semantic summaries via LLM analysis. It comprises five pieces: `compile-run.ts` drives compilation with a C1 freshness gate and bounded concurrency; `generate-semantic.ts` adapts an LLM provider with strict validation and per-run budgets; `static-extractor.ts` parses TypeScript/JavaScript exports/imports via AST; `invalidation.ts` maps diffs to modules; `config.ts` + `hook.ts` provide safe defaults and pre-commit gating. The system enforces run-boundary reentrancy guards, input bounding (interface + dependencies + 12k-char digest), per-run token budgets, and provider-neutral model routing.

## Invariants

- C1 Freshness Gate: isReusableFresh() requires both source hash equality AND semantic sufficiency; a semantic:absent unit must recompile in semantic runs; skip-if-fresh saves provider cost and git churn.
- RUN-Boundary Reentrancy: withComprehensionActive() wraps the entire run and sets HARNESS_COMPREHENSION_ACTIVE; only cross-process nesting is guarded, not in-process concurrency—concurrency:4 proceeds normally.
- Authority-in-TS: Semantic responses re-validated against semanticResponseSchema (Zod, .strip()); malformed output returns null, never partial or corrupt.
- Input Bounded by Static Surface: Semantic prompt is interface + dependencies + ≤12k-char source digest; input tokens bounded by public surface, not raw module size.
- Per-Run Token Budget (Fail-Loud): Enforced from returned tokenUsage.totalTokens; when provider omits usage, charge pessimistic floor (maxOutputTokens) so budget converges; exhaustion leaves remaining modules semantic:absent.
- Provider-Neutral Model Routing: selectSemanticModel() resolves model using same endpoint as provider; Claude-family gets claude-haiku-4-5, OpenAI-compatible gets undefined (provider's own default).
- Static-Only Pre-Commit Hook: Hook always passes --static, bypassing provider and credential entirely (SC4).
- Module Membership (D3): Directory is a module iff direct children include ≥1 supported-extension file (non-recursive); root-level files excluded.
- Graceful Degradation to Static: Missing provider, failed parse, exhausted budget, network errors—all return null or omit generateSemantic; static half always completes, never throws.
- IO-Injected & Testable: ComprehendModuleReader and ComprehendUnitStore abstractions enable unit testing with in-memory fakes, no disk access.

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
