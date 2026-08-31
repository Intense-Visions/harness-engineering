---
schemaVersion: 1
module: 'packages/cli/tests/comprehension'
sourceHash: 'b64291484b3644532cf2b69b80b47f6a776481408a4dd942d31853c66fcad2cf'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'compile-run.test.ts',
    'comprehend-e2e.test.ts',
    'comprehend-flags.test.ts',
    'comprehend-smoke.e2e.test.ts',
    'config.test.ts',
    'generate-semantic.test.ts',
    'hook.test.ts',
    'invalidation.test.ts',
    'regression.test.ts',
    'static-extractor.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createComprehendCommand, formatCompiledUnits, resolveChangedScope, resolveCompileProvider, resolveMode, stageCompiledUnits } from '../../src/commands/comprehend'
import { ChangedSurface } from '../../src/commands/validate-scope'
import { ComprehendRunResult, mapWithConcurrency, runComprehend, runComprehendCheck, runComprehendStats } from '../../src/comprehension/compile-run'
import { comprehensionCli, comprehensionEndpoint, readComprehensionConfig, selectSemanticModel } from '../../src/comprehension/config'
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
import from 'prettier'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
