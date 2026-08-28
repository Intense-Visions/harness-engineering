---
schemaVersion: 1
module: 'packages/core/src/comprehension'
sourceHash: 'e845e9021e1d9f2b2ce7a87d30a15f8cc009b13f7f4c66ead4decec380b742a6'
compiledAt: '2026-08-28T14:18:24.575Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'compile.ts',
    'index.ts',
    'node-io.ts',
    'render.ts',
    'serialize.ts',
    'serve-gate.ts',
    'source-hash.ts',
    'store.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export COMPILER_VERSION
export COMPREHENSION_ROOT
export CompileOptions
export ComprehensionIO
export ComprehensionListing
export ComprehensionProvenance
export ComprehensionSourceFile
export ComprehensionStore
export ComprehensionUnit
export DEFAULT_SOURCE_EXTENSIONS
export ExtractStatic
export GenerateSemantic
export ModuleSourceReader
export SCHEMA_VERSION
export SemanticGeneration
export SemanticInput
export ServeVerdict
export SkippedUnit
export StaticExtraction
export UNIT_FILE
export compileModule
export computeSourceHash
export createNodeComprehensionIO
export createNodeModuleSourceReader
export parseUnit
export renderServedUnit
export serializeUnit
export serveGate
```

## Dependency Slice

```
import { quoteYamlScalar } from '../roadmap/store/yaml-scalar'
import { parseUnit, serializeUnit } from './serialize'
import { ModuleSourceReader } from './serve-gate'
import { computeSourceHash } from './source-hash'
import { ComprehensionIO, UNIT_FILE } from './store'
import { COMPILER_VERSION, ComprehensionProvenance, ComprehensionUnit, DEFAULT_SOURCE_EXTENSIONS, ExtractStatic, GenerateSemantic, SCHEMA_VERSION, SourceFile } from './types'
import { Err, Ok, Result } from '@harness-engineering/types'
import matter from 'gray-matter'
import * as crypto from 'node:crypto'
import * as fsp from 'node:fs/promises'
import * as path from 'node:path'
```
