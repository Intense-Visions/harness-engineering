---
schemaVersion: 1
module: "packages/cli/src/comprehension"
sourceHash: "054ffb9086e25314437eb7ccdb901a3958c1e3253c1e52eb6ab9763d03b708df"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile-run.ts", "config.ts", "generate-semantic.ts", "hook.ts", "invalidation.ts", "static-extractor.ts"]
---

## Summary

packages/cli/src/comprehension is the CLI-side driver for compiled module comprehension—extracting static interface contracts and optionally generating semantic summaries with language-model analysis. It implements phases 3–5 of the comprehension substrate: semantic generation, static extraction, and pre-commit hook gating.

The module comprises five focused pieces: compile-run.ts orchestrates compilation of a module set with bounded concurrency, a shared per-run token budget, and optional LLM semantics, implementing a C1 freshness gate to skip recompiling already-fresh units. generate-semantic.ts adapts an AnalysisProvider into a bounded semantic seam with per-run budgets and strict Zod validation. static-extractor.ts parses TS/JS modules to extract interface contracts and dependencies, anchoring the public surface to index.* when present. invalidation.ts maps changed files to module directories and enumerates all modules. config.ts and hook.ts provide safe-default configuration and a pre-commit gate.

## Invariants

- Fresh units never re-run (C1 gate): a committed unit is reusable when sourceHash matches current hash AND it is semantically sufficient for the run (no semantic added if present, static-only runs need no semantic). Skip entirely—no recompile, write, provider call, or git churn.
- Reentrancy guard is RUN-boundary, not per-module: HARNESS_COMPREHENSION_ACTIVE env var marks the whole run duration and blocks cross-process nesting, but in-process concurrent siblings proceed normally. Never consulted per-module, so concurrency:4 works.
- Input is bounded by static surface + budget digest, never by module size: the semantic prompt is always interface + dependencies + ≤12,000-char source digest, making cost proportional to semantic significance, not file count.
- Authority-in-TS: validate all LLM output at the seam: responses are re-validated against semanticResponseSchema (Zod, .strip() tolerant of extra keys); malformed output returns null and logs a warning, leaving the unit semantic:absent, never partial.
- Failure mode is graceful degradation to semantic:absent: missing provider, failed parse, exhausted budget, network error—all return null or omit generateSemantic, never throw or corrupt the unit. Static half always completes.
- Static extraction is deterministic (dedup + sort) and never fabricates: exports and imports are sorted, de-duplicated, and accumulated from parsed members. Unparseable members are skipped (degrade), empty surfaces render as ''.
- Public surface is barrel-anchored: when index.* exists, ONLY its exports define the interface; otherwise the union of all members' top-level exports. Prevents accidental re-exports of internals.
- Token budget is enforced from RETURNED usage, fail-loud on the next call: when a provider omits usage, charge a pessimistic floor (maxOutputTokens) so budget converges. Exhaustion is warned once; remaining modules left semantic:absent.

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
import { ComprehensionListing, ComprehensionProvenance, ComprehensionSourceFile, ComprehensionUnit, DEFAULT_SOURCE_EXTENSIONS, ExtractStatic, GenerateSemantic, Result, SemanticGeneration, SemanticInput, SkippedUnit, StaticExtraction, TypeScriptParser, compileModule, computeSourceHash, estimateTokens, renderServedUnit, serveGate } from '@harness-engineering/core'
import { AnalysisProvider } from '@harness-engineering/intelligence'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
```
