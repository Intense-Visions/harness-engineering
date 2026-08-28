---
schemaVersion: 1
module: 'packages/eslint-plugin/src/utils'
sourceHash: 'afcce73e2bad670c3f04866421bc4a294cf25025c0264dc7604ff1572cf97502'
compiledAt: '2026-08-28T01:22:11.528Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['ast-helpers.ts', 'config-loader.ts', 'index.ts', 'path-utils.ts', 'schema.ts']
---

## Summary

`packages/eslint-plugin/src/utils` is a utility toolkit for the ESLint plugin that bridges AST analysis, configuration loading, and architectural layer enforcement. It provides three core capabilities:

**Configuration** (`config-loader.ts`): Locates and caches `harness.config.json` by walking up the directory tree from any source file, then validates it against a Zod schema. Caching is keyed to the config file path.

**Path & Layer Resolution** (`path-utils.ts`): Resolves relative imports to project-root-relative paths (with monorepo awareness via `projectRoot` parameter, falling back to a `/src/` heuristic for single-package repos). Matches file paths against layer glob patterns to enforce architectural boundaries.

**AST Introspection** (`ast-helpers.ts`): Detects JSDoc comments, `@internal` tags, and Zod validation calls within function bodies via safe AST traversal that skips non-node properties.

## Invariants

- Path normalization is platform-critical: all path operations normalize Windows backslashes to forward slashes; glob matching relies on this. The /src/ fallback heuristic is unsound in monorepos without an explicit projectRoot.
- Config cache is keyed on file path: a different config path causes a reload and cache eviction. Stale cached config can outlive a config-file deletion if the file path doesn't change.
- External imports pass through unchanged: any import not starting with '.' bypasses path resolution; only relative imports are anchored to project root or the /src/ heuristic.
- Layer matching is first-match-wins: the layers array is iterated in order; the first pattern match determines the layer. Layer order matters and is load-bearing for conflict resolution.
- AST traversal avoids cycles via a hardcoded skip set: properties like parent, loc, range are never recursed into to prevent infinite loops. Zod validation detection is hardcoded to look for parse and safeParse method names only.
- JSDoc detection requires block-comment structure: relies on finding /\*_ and _/ markers in raw source text before node.range[0]; token-only or non-comment-based documentation is invisible.

## Interface Contract

```ts
export *
```

## Dependency Slice

```
import { HarnessConfig, HarnessConfigSchema, Layer } from './schema'
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils'
import * as fs from 'fs'
import { minimatch } from 'minimatch'
import * as path from 'path'
import { z } from 'zod'
```
