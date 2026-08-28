---
schemaVersion: 1
module: 'packages/core/tests/comprehension'
sourceHash: '601c047e59b020f427ef523e5fee4f4c2f0384dce0ee348436af0ed167cf758f'
compiledAt: '2026-08-28T01:22:10.774Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'compile.test.ts',
    'node-io.test.ts',
    'render.test.ts',
    'serialize.test.ts',
    'serve-gate.test.ts',
    'source-hash.test.ts',
    'store.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { compileModule } from '../../src/comprehension/compile'
import { createNodeComprehensionIO, createNodeModuleSourceReader } from '../../src/comprehension/node-io'
import { renderServedUnit } from '../../src/comprehension/render'
import { parseUnit, serializeUnit } from '../../src/comprehension/serialize'
import { ModuleSourceReader, serveGate } from '../../src/comprehension/serve-gate'
import { computeSourceHash } from '../../src/comprehension/source-hash'
import { COMPREHENSION_ROOT, ComprehensionIO, ComprehensionStore, UNIT_FILE } from '../../src/comprehension/store'
import { COMPILER_VERSION, ComprehensionUnit, DEFAULT_SOURCE_EXTENSIONS, ExtractStatic, GenerateSemantic, SCHEMA_VERSION, SourceFile } from '../../src/comprehension/types'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
