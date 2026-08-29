---
schemaVersion: 1
module: "packages/cli/tests/comprehension"
sourceHash: "49fbefbff68d617a902d51a347bd280c30700c5f5779594c2a7e175c2f82134e"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["compile-run.test.ts", "comprehend-e2e.test.ts", "comprehend-flags.test.ts", "comprehend-smoke.e2e.test.ts", "config.test.ts", "generate-semantic.test.ts", "hook.test.ts", "invalidation.test.ts", "static-extractor.test.ts"]
---

## Summary

`packages/cli/tests/comprehension` validates the module compilation and semantic documentation pipeline. The test suite covers three main flows: (1) `runComprehend`—compiles source modules to comprehension units with static extraction + optional semantic generation, supporting both `--changed` (diff-targeted) and `--all` (full enumeration) modes with concurrency bounding and reentrancy protection; (2) `runComprehendCheck`—token-free freshness verification that compares committed unit hashes against live source without provider invocation, gating CI regression detection; (3) `runComprehendStats`—reports raw vs served token compression metrics. Tests use injectable fakes (fakeReader, fakeStore) to isolate logic and track provider invocations, writes, and concurrency peaks.

## Invariants

- C1 – Fresh unit caching: Second runComprehend over unchanged source must skip provider invocation and avoid rewrite. Hash divergence immediately unblocks recompile. Core mechanism for ~90% token savings.
- Byte-stable semantic upgrade: Upgrading semantic:absent → semantic:present (same source, now with provider) must recompile but preserve sourceHash and static provenance unchanged—no compiledAt written (ADR 0109).
- Reentrancy refusal: Engine refuses to run if REENTRANCY_ENV flag is set. Flag is set during run and restored after, preventing re-entry during provider calls.
- Concurrency bounding: mapWithConcurrency and module-parallel compilation must never exceed specified limit (concurrency: N).
- Graceful missing-module handling: Modules with null source reader results are silently skipped, not errored.
- Mode semantics: --changed recompiles only named changed modules; --all recompiles every enumerated module.
- Provider toggle: Presence of generateSemantic function determines semantic:absent (token-free, no provider) vs semantic:present (provider invoked).
- Token-free check gate: runComprehendCheck compares hashes without provider interaction—gates CI regression detection and merge-time verification.

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
