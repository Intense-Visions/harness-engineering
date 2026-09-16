---
schemaVersion: 1
module: 'packages/core/tests/comprehension'
sourceHash: '842cbac4e3f55ca55a5e2f776b13ccb636921d32bb7a6eb145761be6250471e7'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'compile.test.ts',
    'http-io.test.ts',
    'node-io.test.ts',
    'remote-config.test.ts',
    'render.test.ts',
    'run.test.ts',
    'serialize.test.ts',
    'serve-gate.test.ts',
    'source-hash.test.ts',
    'static-extractor.test.ts',
    'store.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { compileModule } from '../../src/comprehension/compile'
import { RemoteUnitNotFoundError, createHttpComprehensionReadIO } from '../../src/comprehension/http-io'
import { createNodeComprehensionIO, createNodeModuleSourceReader } from '../../src/comprehension/node-io'
import { REENTRANCY_ENV, isComprehensionReentrant } from '../../src/comprehension/reentrancy'
import { resolveRemoteComprehension } from '../../src/comprehension/remote-config'
import { renderServedUnit } from '../../src/comprehension/render'
import { mapWithConcurrency, runComprehend, runComprehendCheck, runComprehendStats } from '../../src/comprehension/run'
import { parseUnit, serializeUnit } from '../../src/comprehension/serialize'
import { ModuleSourceReader, serveGate } from '../../src/comprehension/serve-gate'
import { computeSourceHash } from '../../src/comprehension/source-hash'
import { createStaticExtractor, isStaticSupported, renderDependencySlice, renderInterfaceContract } from '../../src/comprehension/static-extractor'
import { COMPREHENSION_ROOT, ComprehensionIO, ComprehensionStore, UNIT_FILE } from '../../src/comprehension/store'
import { COMPILER_VERSION, ComprehensionUnit, DEFAULT_SOURCE_EXTENSIONS, ExtractStatic, GenerateSemantic, SCHEMA_VERSION, SourceFile } from '../../src/comprehension/types'
import { ComprehensionListing, ComprehensionSourceFile, ComprehensionUnit, Err, ExtractStatic, GenerateSemantic, Ok, computeSourceHash } from '@harness-engineering/core'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
