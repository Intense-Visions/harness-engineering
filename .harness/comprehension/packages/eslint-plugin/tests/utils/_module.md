---
schemaVersion: 1
module: 'packages/eslint-plugin/tests/utils'
sourceHash: 'd6e4a994dea17f5fc5771c40f746b307bbb7f1773abb2b2c68573be95ea0d444'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'ast-helpers.test.ts',
    'config-loader.test.ts',
    'path-utils.test.ts',
    'schema.test.ts',
    'workspace-packages.test.ts',
  ]
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
import { clearWorkspaceCache, loadWorkspacePackages, parsePnpmWorkspacePackages, resolveWorkspaceImport, resolveWorkspaceSpecifier, splitBareSpecifier } from '../../src/utils/workspace-packages'
import { parse } from '@typescript-eslint/parser'
import { TSESTree } from '@typescript-eslint/utils'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
