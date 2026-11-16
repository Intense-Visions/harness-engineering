---
schemaVersion: 1
module: 'packages/cli/src/comprehension'
sourceHash: '32eea2a04c56ef006f25bdf077bed87a0b86ffe4dd541f767785aa270e6474ec'
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
    'prune.ts',
    'refresh-gate.ts',
    'regression.ts',
    'semantic-coverage.ts',
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
export RemoteComprehensionConfig
export RemoteComprehensionFileConfig
export STATIC_SUPPORTED_EXTENSIONS
export assessSemanticCoverage
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
export findOrphanModules
export formatSemanticCoverage
export isComprehensionReentrant
export isEnumerableModulePath
export isMainPassContext
export isStaticSupported
export mapWithConcurrency
export maybeCreateGenerateSemantic
export parseModuleSemantic
export pruneOrphanUnits
export readComprehensionConfig
export readSemanticMapAtRef
export remoteFileConfig
export renderDependencySlice
export renderInterfaceContract
export resolveComprehensionBranch
export resolveComprehensionCiMode
export resolveRefreshJobGate
export resolveRemoteComprehension
export resolveRemoteComprehensionWithGlobalToken
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
import { findOrphanModules } from './compile-run'
import { readComprehensionConfig } from './config'
import { defaultSemanticModel } from './generate-semantic'
import { RegressionContext } from './regression'
import { COMPREHENSION_ROOT, ComprehensionSourceFile, ComprehensionStore, DEFAULT_SOURCE_EXTENSIONS, GenerateSemantic, RemoteComprehensionFileConfig, SemanticCoverage, SemanticGeneration, SemanticInput, normalizeRemoteFileConfig } from '@harness-engineering/core'
import { AnalysisProvider } from '@harness-engineering/intelligence'
import { execSync, spawnSync } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
```
