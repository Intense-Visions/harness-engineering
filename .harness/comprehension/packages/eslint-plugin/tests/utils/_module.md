---
schemaVersion: 1
module: 'packages/eslint-plugin/tests/utils'
sourceHash: '74575186aa6ca3e975a3ae222c588206532c7b21b674e6b31f62802e49b7c1ec'
compiledAt: '2026-08-28T01:22:11.543Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['ast-helpers.test.ts', 'config-loader.test.ts', 'path-utils.test.ts', 'schema.test.ts']
---

## Summary

The `packages/eslint-plugin/tests/utils` module tests three core utility subsystems: (1) **AST Helpers** detects static-analysis markers on TypeScript-ESLint AST nodes (JSDoc comments and Zod validation patterns like schema.parse/safeParse); (2) **Config Loader** walks the directory tree to find and cache harness.config.json, validates it against a schema, and degrades gracefully on errors; (3) **Path Utils** normalizes filesystem paths to project-relative form, resolves relative imports, and matches files against glob patterns to assign architectural layers, with monorepo support via optional projectRoot parameter.

## Invariants

- Config caching is keyed by the directory containing harness.config.json, not per-file — all files resolving to the same config-root share one cached object reference
- Path normalization is cross-platform: converts backslash separators to forward slash, anchors to /src/ boundary (or projectRoot-relative prefix in monorepos), and preserves package prefixes when projectRoot is supplied
- Layer assignment returns the first matching glob pattern — overlapping patterns are order-sensitive and only the first match is used
- Monorepo support degrades to single-package heuristics when projectRoot is omitted, falling back to /src/ boundary detection
- AST helpers operate on TypeScript-ESLint parsed trees and distinguish between JSDoc (/\*\* \*/) and line comments (//)
- Zod validation detection is pattern-based and works for any schema variable name (.parse() or .safeParse() calls anywhere in function bodies)
- Config loader validates against HarnessConfigSchema and returns null for missing, malformed, or schema-invalid JSON files

## Interface Contract

```ts

```

## Dependency Slice

```
import { hasJSDocComment, hasZodValidation } from '../../src/utils/ast-helpers'
import { clearConfigCache, getConfig, getConfigRoot } from '../../src/utils/config-loader'
import { getLayerForFile, matchesPattern, normalizePath, resolveImportPath } from '../../src/utils/path-utils'
import { HarnessConfigSchema, Layer } from '../../src/utils/schema'
import { parse } from '@typescript-eslint/parser'
import { TSESTree } from '@typescript-eslint/utils'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
