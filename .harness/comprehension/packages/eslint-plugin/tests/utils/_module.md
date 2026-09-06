---
schemaVersion: 1
module: 'packages/eslint-plugin/tests/utils'
sourceHash: 'c5352214f541f084a1e1d2e419a41a0bceebc82efa96ce93d5bc47d7b94b39c9'
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
import { hasJSDocComment, hasZodValidation, isTestModifierCall } from '../../src/utils/ast-helpers'
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
