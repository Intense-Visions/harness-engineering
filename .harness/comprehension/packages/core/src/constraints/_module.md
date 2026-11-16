---
schemaVersion: 1
module: 'packages/core/src/constraints'
sourceHash: '656773a23f2ae782c9762a9170d986c0d6e3238392a502000a8467f00cd8ad46'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'boundary.ts',
    'circular-deps.ts',
    'dependencies.ts',
    'index.ts',
    'layer-config.ts',
    'layers.ts',
    'packs.ts',
    'types.ts',
    'workspace-packages.ts',
  ]
---

## Interface Contract

```ts
export *
export BUILT_IN_CONSTRAINT_PACKS
export BareSpecifierResolver
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
export DepsFallbackBehavior
export DepsSettings
export GraphDependencyData
export Layer
export LayerConfig
export ParserLookup
export ResolvedConstraintPacks
export UnparsedFile
export buildDependencyGraph
export createBoundaryValidator
export defineLayer
export detectCircularDeps
export detectCircularDepsInFiles
export getConstraintPack
export resolveConstraintPacks
export resolveDepsSettings
export resolveFileToLayer
export toLayerConfig
export validateBoundaries
export validateDependencies
```

## Dependency Slice

```
import { RuleOverride } from '../security/types'
import { ConstraintError, createError } from '../shared/errors'
import { fileExists, findFiles, readFileContent, relativePosix } from '../shared/fs-utils'
import { Import, LanguageParser } from '../shared/parsers'
import { Err, Ok, Result } from '../shared/result'
import { buildDependencyGraph } from './dependencies'
import { defineLayer, resolveFileToLayer } from './layers'
import { BoundaryDefinition, BoundaryValidation, BoundaryValidator, BoundaryViolation, CircularDependency, CircularDepsResult, DependencyEdge, DependencyGraph, DependencyValidation, DependencyViolation, GraphDependencyData, Layer, LayerConfig, UnparsedFile } from './types'
import { loadWorkspacePackages, resolveWorkspaceSpecifier } from './workspace-packages'
import { ConstraintStage } from '@harness-engineering/types'
import { minimatch } from 'minimatch'
import * as path from 'node:path'
import { dirname, extname, join, resolve } from 'path'
import { parseYaml } from 'yaml'
import { z } from 'zod'
```
