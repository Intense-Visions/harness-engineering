---
schemaVersion: 1
module: 'packages/cli/tests/comprehension'
sourceHash: '0c29e6a8de9842206790e790cacdd6552938ffe012a89b0f262a0adef4d50d7b'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'comprehend-e2e.test.ts',
    'comprehend-flags.test.ts',
    'comprehend-smoke.e2e.test.ts',
    'config.test.ts',
    'generate-semantic.test.ts',
    'hook.test.ts',
    'invalidation.test.ts',
    'policy.test.ts',
    'refresh-gate.test.ts',
    'regression.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createComprehendCommand, formatCompiledUnits, resolveChangedScope, resolveCompileProvider, resolveMode, resolveStaticOnlyPosture, stageCompiledUnits } from '../../src/commands/comprehend'
import { ChangedSurface } from '../../src/commands/validate-scope'
import { ComprehendRunResult, runComprehend, runComprehendCheck, runComprehendStats } from '../../src/comprehension/compile-run'
import { comprehensionCli, comprehensionEndpoint, readComprehensionConfig, resolveComprehensionCiMode, selectSemanticModel } from '../../src/comprehension/config'
import { maybeCreateGenerateSemantic } from '../../src/comprehension/generate-semantic'
import { DEFAULT_DIGEST_CHAR_BUDGET, DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_SEMANTIC_MODEL, REENTRANCY_ENV, boundSourceDigest, buildSemanticPrompt, createGenerateSemantic, defaultSemanticModel, isComprehensionReentrant, maybeCreateGenerateSemantic, semanticResponseSchema, withComprehensionActive } from '../../src/comprehension/generate-semantic.js'
import { shouldRunComprehendHook } from '../../src/comprehension/hook'
import { enumerateModules, filesToModules } from '../../src/comprehension/invalidation'
import { MAIN_BRANCH, committedSemanticAllowed, isMainPassContext, resolveComprehensionBranch } from '../../src/comprehension/policy'
import { RefreshJobGateReason, explainInactiveRefreshGate, resolveRefreshJobGate } from '../../src/comprehension/refresh-gate'
import { RefReadDeps, SemanticState, detectCommittedSemanticOnBranch, detectSemanticRegressions, parseModuleSemantic, readSemanticMapAtRef } from '../../src/comprehension/regression'
import { createStaticExtractor } from '../../src/comprehension/static-extractor'
import { ComprehensionConfigSchema, HarnessConfig, HarnessConfigSchema } from '../../src/config/schema'
import { ComprehensionStore, SemanticInput, SourceFile, StaticExtraction, compileModule, createNodeComprehensionIO, createNodeModuleSourceReader, serveGate } from '@harness-engineering/core'
import { AnalysisProvider, AnalysisRequest, AnalysisResponse } from '@harness-engineering/intelligence'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import * as fsp from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as path, path from 'node:path'
import from 'prettier'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
