---
schemaVersion: 1
module: 'packages/core/tests/constraints'
sourceHash: 'ab7eb6a19bcec49b47ce04a8524ec340bd693ef413ac0db7ee86305e11b87dd6'
compiledAt: '2026-08-28T01:22:10.799Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'boundary.test.ts',
    'circular-deps.test.ts',
    'dependencies.test.ts',
    'graph-integration.test.ts',
    'layers.test.ts',
    'multi-lang-deps.test.ts',
    'packs.test.ts',
  ]
---

## Summary

The `packages/core/tests/constraints` module tests the constraint-validation subsystem that enforces architectural boundaries and dependency rules across the codebase. It spans four core domains: **Boundary Validation** uses Zod schemas to validate data at layer interfaces with both parse-with-coercion and boolean-validate modes. **Circular Dependency Detection** identifies cycles in import graphs using traversal, handling edge cases like disconnected nodes and external edges. **Dependency Graph Building** constructs static import graphs from source files with careful resolution for both NodeNext (`.js` → `.ts`) and Babel (`.js` → `.jsx`) conventions to fix issue #279. **Layer Architecture** enforces directional dependencies between logical layers via glob patterns, with `extraIgnore` to exclude files from validation. **Constraint Packs** bundle security rules into named presets (`secrets-and-injection`, `web-hardening`, `ai-agent-safety`), each with stage-specific rule mappings.

## Invariants

- Import resolution is conventions-aware: .js imports must resolve to .ts (NodeNext) or .jsx (Babel) files on disk, not to literal .js paths or \*.js.ts artifacts, preventing edges from pointing to non-existent files.
- Circular dependency detection is robust to graph topology: must handle empty graphs, disconnected nodes, self-loops, and edges pointing outside the node set without false positives.
- Layer validation is glob-pattern based, not hard-coded: files are mapped to layers via glob patterns; layer membership is not inferred from directory names or naming conventions.
- extraIgnore genuinely removes files from discovery: when a glob is listed in extraIgnore, that file must not appear in the walked set (not merely excluded from violation checks); tests verify this by showing violations vanish when the violating file is ignored.
- Constraint packs are stage-filtered: security rules are keyed by pack+stage; queries must respect stage filters to avoid applying pre-release rules at pre-merge gates.
- Pre-computed graph data bypasses parsing entirely: when graphDependencyData is passed, the parser is never called; this is verified via mocks to prove the integration path.
- Boundary violations are collected, not fast-failed: validateBoundaries accumulates all violations before returning, so callers see the full problem set, not just the first error.

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
import { Err, Ok } from '../../src/shared/result'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
