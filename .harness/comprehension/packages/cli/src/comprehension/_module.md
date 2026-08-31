---
schemaVersion: 1
module: 'packages/cli/src/comprehension'
sourceHash: 'b447163155266d00ed327636bc941c02ff46f1e677d8347c8bae32e92ce5db32'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'compile-run.ts',
    'config.ts',
    'generate-semantic.ts',
    'hook.ts',
    'invalidation.ts',
    'regression.ts',
    'static-extractor.ts',
  ]
---

## Interface Contract

```ts
export DEFAULT_DIGEST_CHAR_BUDGET
export DEFAULT_MAX_OUTPUT_TOKENS
export DEFAULT_SEMANTIC_MODEL
export REENTRANCY_ENV
export STATIC_SUPPORTED_EXTENSIONS
export boundSourceDigest
export buildSemanticPrompt
export comprehensionCli
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
import { AnalysisCliConfig, AnalysisEndpoint, ProviderKind, resolveProviderKind } from '../mcp/utils/analysis-provider'
import { readComprehensionConfig } from './config'
import { defaultSemanticModel, isComprehensionReentrant, withComprehensionActive } from './generate-semantic'
import { COMPREHENSION_ROOT, ComprehensionListing, ComprehensionProvenance, ComprehensionSourceFile, ComprehensionUnit, DEFAULT_SOURCE_EXTENSIONS, ExtractStatic, GenerateSemantic, Result, SemanticGeneration, SemanticInput, SkippedUnit, StaticExtraction, TypeScriptParser, compileModule, computeSourceHash, estimateTokens, renderServedUnit, serveGate } from '@harness-engineering/core'
import { AnalysisProvider } from '@harness-engineering/intelligence'
import { spawnSync } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
```
