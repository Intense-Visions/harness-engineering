---
schemaVersion: 1
module: 'packages/core/src/constraints'
sourceHash: '718a09ea42f75804911de0b2a3e649c5533804086409721edd9b71ad7a5f3279'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'boundary.ts',
    'circular-deps.ts',
    'dependencies.ts',
    'index.ts',
    'layers.ts',
    'packs.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export *
export BUILT_IN_CONSTRAINT_PACKS
export BoundaryDefinition
export BoundaryValidation
export BoundaryValidator
export BoundaryViolation
export CircularDependency
export CircularDepsResult
export ConstraintPack
export ConstraintPackStageSpec
export DependencyEdge
export DependencyGraph
export DependencyValidation
export DependencyViolation
export GraphDependencyData
export Layer
export LayerConfig
export ParserLookup
export ResolvedConstraintPacks
export buildDependencyGraph
export createBoundaryValidator
export defineLayer
export detectCircularDeps
export detectCircularDepsInFiles
export getConstraintPack
export resolveConstraintPacks
export resolveFileToLayer
export validateBoundaries
export validateDependencies
```

## Dependency Slice

```
import { RuleOverride } from '../security/types'
import { ConstraintError, createError } from '../shared/errors'
import { fileExists, findFiles, relativePosix } from '../shared/fs-utils'
import { Import, LanguageParser } from '../shared/parsers'
import { Err, Ok, Result } from '../shared/result'
import { buildDependencyGraph } from './dependencies'
import { resolveFileToLayer } from './layers'
import { BoundaryDefinition, BoundaryValidation, BoundaryValidator, BoundaryViolation, CircularDependency, CircularDepsResult, DependencyEdge, DependencyGraph, DependencyValidation, DependencyViolation, GraphDependencyData, Layer, LayerConfig } from './types'
import { ConstraintStage } from '@harness-engineering/types'
import { minimatch } from 'minimatch'
import { dirname, extname, resolve } from 'path'
import { z } from 'zod'
```
