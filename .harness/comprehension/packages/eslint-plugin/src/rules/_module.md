---
schemaVersion: 1
module: 'packages/eslint-plugin/src/rules'
sourceHash: '83dd3bcf2a4dca66b39981e8776fad77fe6aad6d42277af905f3f86b03b5b503'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'enforce-doc-exports.ts',
    'index.ts',
    'no-circular-deps.ts',
    'no-disabled-tests.ts',
    'no-empty-describe.ts',
    'no-focused-tests.ts',
    'no-forbidden-imports.ts',
    'no-hardcoded-path-separator.ts',
    'no-hardcoded-test-count.ts',
    'no-layer-violation.ts',
    'no-nested-loops-in-critical.ts',
    'no-process-env-in-spawn.ts',
    'no-process-exit.ts',
    'no-skipped-tests.ts',
    'no-spread-in-variadic.ts',
    'no-sync-io-in-async.ts',
    'no-unbounded-array-chains.ts',
    'no-undefined-optional-assignment.ts',
    'no-unix-shell-command.ts',
    'prefer-execfile-over-exec.ts',
    'require-boundary-schema.ts',
    'require-path-normalization.ts',
  ]
---

## Interface Contract

```ts
export rules
```

## Dependency Slice

```
import { hasJSDocComment, hasZodValidation, isMarkedInternal, isTestModifierCall } from '../utils/ast-helpers'
import { getConfig, getConfigRoot } from '../utils/config-loader'
import { getLayerByName, getLayerForFile, matchesPattern, normalizePath, resolveImportPath } from '../utils/path-utils'
import enforceDocExports from './enforce-doc-exports'
import noCircularDeps from './no-circular-deps'
import noDisabledTests from './no-disabled-tests'
import noEmptyDescribe from './no-empty-describe'
import noFocusedTests from './no-focused-tests'
import noForbiddenImports from './no-forbidden-imports'
import noHardcodedPathSeparator from './no-hardcoded-path-separator'
import noHardcodedTestCount from './no-hardcoded-test-count'
import noLayerViolation from './no-layer-violation'
import noNestedLoopsInCritical from './no-nested-loops-in-critical'
import noProcessEnvInSpawn from './no-process-env-in-spawn'
import noProcessExit from './no-process-exit'
import noSkippedTests from './no-skipped-tests'
import noSpreadInVariadic from './no-spread-in-variadic'
import noSyncIoInAsync from './no-sync-io-in-async'
import noUnboundedArrayChains from './no-unbounded-array-chains'
import noUndefinedOptionalAssignment from './no-undefined-optional-assignment'
import noUnixShellCommand from './no-unix-shell-command'
import preferExecfileOverExec from './prefer-execfile-over-exec'
import requireBoundarySchema from './require-boundary-schema'
import requirePathNormalization from './require-path-normalization'
import { AST_NODE_TYPES, ESLintUtils, TSESLint, TSESTree } from '@typescript-eslint/utils'
import * as path from 'path'
```
