---
schemaVersion: 1
module: 'packages/core/tests/fixtures/typescript-samples'
sourceHash: 'deba77b6a29e0ecd44230ae4dad888a2ce92a5802c1658f594a55a04ada4355d'
compiledAt: '2026-08-28T01:22:10.864Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['exports.ts', 'imports.ts', 'simple.ts', 'syntax-error.ts']
---

## Summary

`typescript-samples` is a fixture demonstrating TypeScript import/export syntax comprehension. It's a multi-file test bed covering named exports, default exports, re-exports (including namespace and wildcard), type-only imports, dynamic imports, and mixed patterns. Files include exports.ts (canonical export shapes), imports.ts (canonical import shapes), simple.ts (reduced example), and syntax-error.ts (intentionally broken for error testing).

## Invariants

- Export surface is exact: exports.ts must produce all 11 named exports (VERSION, Service, a, b, helper, join, resolve, utils, plus fs re-exports) plus default export; any drift breaks downstream import tests
- Re-exports are live: wildcard exports (export _ from 'fs') and namespace exports (export _ as utils) must resolve correctly; stripping or renaming breaks test intent
- Type-only imports don't leak to runtime: import type { Stats } and inline type specifiers must not emit JS; syntax-aware tools must distinguish them
- Dynamic import is async: import('./dynamic-module') in loadModule() must resolve at runtime, not compile-time
- Syntax error stays broken: syntax-error.ts must remain unparseable; fixing it invalidates error-case coverage

## Interface Contract

```ts
export *
export Service
export VERSION
export a
export b
export default
export helper
export join
export resolve
export utils
```

## Dependency Slice

```
import from './dynamic-module'
import from './styles.css'
import fs, { PathLike, Stats, existsSync } from 'fs'
import * as os from 'os'
import { join, resolve } from 'path'
import React, { useEffect, useState } from 'react'
```
