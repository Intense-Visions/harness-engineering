---
schemaVersion: 1
module: 'packages/cli/src/comprehension'
sourceHash: 'f0e3ce6413ae30045e5c4859024c0c211898f0bb41823efc2878763b09833119'
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
    'policy.ts',
    'refresh-gate.ts',
    'regression.ts',
    'static-extractor.ts',
  ]
---

## Interface Contract

```ts
export ComprehendCheckResult
export ComprehendListStore
export ComprehendModuleReader
export ComprehendRunOptions
export ComprehendRunResult
export ComprehendStatsResult
export ComprehendUnitStore
export DEFAULT_DIGEST_CHAR_BUDGET
export DEFAULT_MAX_OUTPUT_TOKENS
export DEFAULT_SEMANTIC_MODEL
export MAIN_BRANCH
export REENTRANCY_ENV
export STATIC_SUPPORTED_EXTENSIONS
export boundSourceDigest
export buildSemanticPrompt
export committedSemanticAllowed
export comprehensionCli
export comprehensionEndpoint
export createGenerateSemantic
export createStaticExtractor
export defaultRefReadDeps
export defaultSemanticModel
export detectCommittedSemanticOnBranch
export detectSemanticRegressions
export enumerateModules
export explainInactiveRefreshGate
export filesToModules
export isComprehensionReentrant
export isMainPassContext
export isStaticSupported
export mapWithConcurrency
export maybeCreateGenerateSemantic
export parseModuleSemantic
export readComprehensionConfig
export readSemanticMapAtRef
export renderDependencySlice
export renderInterfaceContract
export resolveComprehensionBranch
export resolveComprehensionCiMode
export resolveRefreshJobGate
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
import { defaultSemanticModel } from './generate-semantic'
import { COMPREHENSION_ROOT, ComprehensionSourceFile, DEFAULT_SOURCE_EXTENSIONS, GenerateSemantic, SemanticGeneration, SemanticInput } from '@harness-engineering/core'
import { AnalysisProvider } from '@harness-engineering/intelligence'
import { execSync, spawnSync } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
```
