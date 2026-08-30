---
schemaVersion: 1
module: "packages/cli/tests/comprehension"
sourceHash: "b037bc42e73fb4f9c23095872dc053ea8d5e2361307cdc95968d47be9ad06585"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile-run.test.ts", "comprehend-e2e.test.ts", "comprehend-flags.test.ts", "comprehend-smoke.e2e.test.ts", "config.test.ts", "generate-semantic.test.ts", "hook.test.ts", "invalidation.test.ts", "regression.test.ts", "static-extractor.test.ts"]
---

## Summary

`packages/cli/tests/comprehension` validates the semantic-comprehension compiler pipeline that generates committed markdown documentation units (shards) from source code. The ~2000-line test suite across 10 files covers three core flows: (1) `runComprehend`—compiles modules with static extraction (interfaces, dependencies) and optional LLM semantic generation (summaries, invariants) in `--changed` or `--all` modes with pluggable concurrency and provider; (2) `runComprehendCheck`—token-free freshness gate comparing committed hashes vs live source for CI regression detection without LLM cost; (3) `runComprehendStats`—reports token compression savings. Tests use hermetic fake stores/readers/providers to track invocations, writes, and peaks. CLI tests validate flag precedence (`--static` disables semantic, `--stage` git-stages shards, hook mode skips on git-derivation failure). E2E tests drive real stores and config. Generate-semantic tests validate LLM interaction, budget enforcement, reentrancy guarding, and response schema validation.

## Invariants

- C1 — Fresh units never re-run: unchanged source hash must skip provider invocation and avoid rewrite. Hash divergence or semantic-upgrade (absent→present, same hash) unblocks recompile. Core mechanism for ~90% token savings.
- ADR 0109 — Byte-stable semantic upgrade: upgrading semantic:absent → semantic:present with same source must recompile but preserve sourceHash and static provenance unchanged. No compiledAt wall-clock written.
- Reentrancy refusal: REENTRANCY_ENV flag set during run and restored after (even on error). If set on entry, runComprehend refuses to compile (no writes). Prevents re-entry during provider calls.
- SC3 — Changed mode precision: --changed recompiles exactly the named changed-module set (files → owning directories). Git failure falls back to --all with warning (non-hook) or skips (hook mode).
- SC4 — Static-only by design: pre-commit hook always runs --static regardless of config. --static disables provider resolution, ensuring semantic:absent (no token cost). Semantic is opt-in via explicit generateSemantic argument.
- Concurrency bounded: mapWithConcurrency and module-parallel compilation never exceed concurrency parameter. Peak in-flight operations ≤ concurrency.
- Provider toggle: Presence of generateSemantic function determines semantic:absent (static-only, no provider) vs semantic:present (provider invoked). Null provider → no semantic seam.
- Source reader nullability: modules returning null (deleted directories) silently skipped with no error. Not written, not recompiled.
- Token-free check gate: runComprehendCheck compares hashes without provider interaction—validates freshness at merge time and gates CI regressions.
- Semantic regression detection: detectSemanticRegressions only flags present→absent transitions. New modules and deleted modules ignored. Result sorted for deterministic output.

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
import { RefReadDeps, SemanticState, detectSemanticRegressions, parseModuleSemantic, readSemanticMapAtRef } from '../../src/comprehension/regression'
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
