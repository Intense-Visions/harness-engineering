---
schemaVersion: 1
module: 'packages/core/src/comprehension'
sourceHash: '4454a6b32ea376006448148b881f946ec4e758794d5f5f1864f7648f82cb214d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'compile.ts',
    'http-io.ts',
    'index.ts',
    'node-io.ts',
    'public-outposts.ts',
    'reentrancy.ts',
    'remote-config.ts',
    'render.ts',
    'run.ts',
    'serialize.ts',
    'serve-gate.ts',
    'source-hash.ts',
    'static-extractor.ts',
    'store.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export COMPILER_VERSION
export COMPREHENSION_ROOT
export CompileOptions
export ComprehendCheckResult
export ComprehendListStore
export ComprehendModuleReader
export ComprehendRunOptions
export ComprehendRunResult
export ComprehendStatsResult
export ComprehendUnitStore
export ComprehensionIO
export ComprehensionListing
export ComprehensionProvenance
export ComprehensionSourceFile
export ComprehensionStore
export ComprehensionUnit
export DEFAULT_REMOTE_URL
export DEFAULT_SOURCE_EXTENSIONS
export ExtractStatic
export FetchPublicOutpostsConfig
export GenerateSemantic
export HttpComprehensionConfig
export ModuleSourceReader
export PublicOutpost
export REENTRANCY_ENV
export RemoteComprehensionConfig
export RemoteComprehensionFileConfig
export RemoteUnitNotFoundError
export SCHEMA_VERSION
export STATIC_SUPPORTED_EXTENSIONS
export SemanticGeneration
export SemanticInput
export ServeVerdict
export SkippedUnit
export StaticExtraction
export UNIT_FILE
export compileModule
export computeSourceHash
export createHttpComprehensionReadIO
export createNodeComprehensionIO
export createNodeModuleSourceReader
export createStaticExtractor
export fetchPublicOutposts
export isComprehensionReentrant
export isStaticSupported
export mapWithConcurrency
export normalizeRemoteFileConfig
export parseUnit
export renderDependencySlice
export renderInterfaceContract
export renderServedUnit
export resolveRemoteComprehension
export runComprehend
export runComprehendCheck
export runComprehendStats
export serializeUnit
export serveGate
export withComprehensionActive
```

## Dependency Slice

```
import { estimateTokens } from '../compaction/envelope'
import { quoteYamlScalar } from '../roadmap/store/yaml-scalar'
import { TypeScriptParser } from '../shared/parsers'
import { Result } from '../shared/result'
import { compileModule } from './compile'
import { isComprehensionReentrant, withComprehensionActive } from './reentrancy'
import { renderServedUnit } from './render'
import { parseUnit, serializeUnit } from './serialize'
import { ModuleSourceReader, serveGate } from './serve-gate'
import { computeSourceHash } from './source-hash'
import { COMPREHENSION_ROOT, ComprehensionIO, ComprehensionListing, SkippedUnit, UNIT_FILE } from './store'
import { COMPILER_VERSION, ComprehensionProvenance, ComprehensionSourceFile, ComprehensionUnit, DEFAULT_SOURCE_EXTENSIONS, ExtractStatic, GenerateSemantic, SCHEMA_VERSION, SourceFile, StaticExtraction } from './types'
import { Err, Ok, Result } from '@harness-engineering/types'
import matter from 'gray-matter'
import * as crypto from 'node:crypto'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
```
