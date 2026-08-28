---
schemaVersion: 1
module: 'packages/core/src/constraints'
sourceHash: 'e68e639b0f1ae35608b2d7877218ed07fff77e2d4bd3eb30fc760b60fdb1e546'
compiledAt: '2026-08-28T01:22:10.330Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `packages/core/src/constraints` module enforces architectural constraints through four mechanisms: (1) dependency graph building and layer validation—parsing source files to extract imports, normalizing paths, and validating that dependencies respect configured layer boundaries; (2) circular dependency detection via Tarjan's Strongly Connected Components algorithm to find all cycles including self-referential edges; (3) boundary validation using Zod schemas to enforce encapsulation at layer boundaries; and (4) constraint packs—lightweight opt-in bundles of security rule overrides scoped per lifecycle stage (pre-commit, pre-merge, pre-release). A `sharing` subpackage enables portability by exporting constraints as manifests, bundles, and lockfiles for downstream projects to reuse and merge.

## Invariants

- Extension fallback resolution: JS-style import extensions (.js, .jsx) resolve to different on-disk extensions (.ts, .tsx, .jsx) via filesystem verification; skipping this silently drops edges from the dependency graph.
- Path normalization: All file paths normalized to forward slashes for cross-platform consistency in graph nodes and edges.
- Graph data short-circuit: When graphDependencyData is provided, bypass file parsing and use pre-computed nodes/edges directly.
- Single layer per file: Each file resolves to at most one layer via ordered glob pattern matching; files in no layer skip validation entirely.
- SCC cycle detection: Tarjan's algorithm must check both multi-node cycles and self-edges (isCyclicSCC); excluding either misses real cycles.
- Parser health check: Validation delegates to parser.health() before parsing; respects fallbackBehavior (skip/warn/error) on unavailable parsers.
- Constraint pack severity merge: mostBlocking() ensures that when two packs set the same rule, higher severity always wins (off < info < warning < error).
- External package filtering: Imports are local-only if they start with . or /; scoped packages and node_modules are filtered out early.
- Layer violation detection: Violations only reported when both from and to files resolve to defined layers and from is not the same layer as to.

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
