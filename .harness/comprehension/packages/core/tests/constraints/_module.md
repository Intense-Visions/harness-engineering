---
schemaVersion: 1
module: 'packages/core/tests/constraints'
sourceHash: '750a070986383619b811955029bb9fc7fd7c070a7a969e3024a7ebca54c24a31'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'boundary.test.ts',
    'circular-deps-chain.test.ts',
    'circular-deps.test.ts',
    'dependencies.test.ts',
    'graph-integration.test.ts',
    'layers.test.ts',
    'multi-lang-deps.test.ts',
    'packs.test.ts',
    'parser-unavailable-abstention.test.ts',
    'unparseable-files.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { createBoundaryValidator, validateBoundaries } from '../../src/constraints/boundary'
import { detectCircularDeps, detectCircularDepsInFiles } from '../../src/constraints/circular-deps'
import { ParserLookup, buildDependencyGraph, defineLayer, validateDependencies } from '../../src/constraints/dependencies'
import { defineLayer, resolveFileToLayer } from '../../src/constraints/layers'
import { BUILT_IN_CONSTRAINT_PACKS, getConstraintPack, resolveConstraintPacks } from '../../src/constraints/packs'
import { DependencyGraph, GraphDependencyData, Layer } from '../../src/constraints/types'
import { createError } from '../../src/shared/errors'
import { LanguageParser, TypeScriptParser } from '../../src/shared/parsers'
import { AST, Export, Import, LanguageParser } from '../../src/shared/parsers/base'
import { TypeScriptParser } from '../../src/shared/parsers/typescript'
import { Err, Ok } from '../../src/shared/result'
import * as fs from 'fs'
import * as os from 'os'
import { join } from 'path'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
