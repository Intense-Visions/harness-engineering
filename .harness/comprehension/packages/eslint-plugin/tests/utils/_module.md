---
schemaVersion: 1
module: 'packages/eslint-plugin/tests/utils'
sourceHash: '74575186aa6ca3e975a3ae222c588206532c7b21b674e6b31f62802e49b7c1ec'
compiledAt: '2026-08-28T01:22:11.543Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['ast-helpers.test.ts', 'config-loader.test.ts', 'path-utils.test.ts', 'schema.test.ts']
---

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
