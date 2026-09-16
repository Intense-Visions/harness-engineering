---
schemaVersion: 1
module: 'packages/cli/src/comprehension'
sourceHash: '0451d49c2ee5f293987a2522eb2465ca858eb09a4461c977a697f272592b1886'
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
export RemoteComprehensionConfig
export RemoteComprehensionFileConfig
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
export remoteFileConfig
export renderDependencySlice
export renderInterfaceContract
export resolveComprehensionBranch
export resolveComprehensionCiMode
export resolveRefreshJobGate
export resolveRemoteComprehension
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
import { COMPREHENSION_ROOT, ComprehensionSourceFile, DEFAULT_SOURCE_EXTENSIONS, GenerateSemantic, RemoteComprehensionFileConfig, SemanticGeneration, SemanticInput, normalizeRemoteFileConfig } from '@harness-engineering/core'
import { AnalysisProvider } from '@harness-engineering/intelligence'
import { execSync, spawnSync } from 'node:child_process'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
import { z } from 'zod'
```
