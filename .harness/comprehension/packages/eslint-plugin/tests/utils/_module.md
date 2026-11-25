---
schemaVersion: 1
module: 'packages/eslint-plugin/tests/utils'
sourceHash: 'f23327ae461fc0e1454812e12cce1b43581b1e1bb25db087f911cc114f5da35f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'ast-helpers.test.ts',
    'config-loader.test.ts',
    'path-utils.test.ts',
    'relative-imports.test.ts',
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
import { clearRelativeImportCaches, readRelativeImports, resolveRelativeImport, toGraphKey } from '../../src/utils/relative-imports'
import { HarnessConfigSchema, Layer } from '../../src/utils/schema'
import { clearWorkspaceCache, loadWorkspacePackages, parsePnpmWorkspacePackages, resolveWorkspaceImport, resolveWorkspaceSpecifier, splitBareSpecifier } from '../../src/utils/workspace-packages'
import { parse } from '@typescript-eslint/parser'
import { TSESTree } from '@typescript-eslint/utils'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
