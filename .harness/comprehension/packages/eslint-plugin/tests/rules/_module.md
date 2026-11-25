---
schemaVersion: 1
module: 'packages/eslint-plugin/tests/rules'
sourceHash: 'c1ca491a37ec6a3318ccb13914f690e3a59eb14adbd73b643120f01e0643f5af'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'enforce-doc-exports.test.ts',
    'no-circular-deps-resolution.test.ts',
    'no-circular-deps.test.ts',
    'no-disabled-tests.test.ts',
    'no-empty-describe.test.ts',
    'no-focused-tests.test.ts',
    'no-forbidden-imports.test.ts',
    'no-hardcoded-path-separator.test.ts',
    'no-hardcoded-test-count.test.ts',
    'no-layer-violation-workspace.test.ts',
    'no-layer-violation.test.ts',
    'no-nested-loops-in-critical.test.ts',
    'no-process-env-in-spawn.test.ts',
    'no-process-exit.test.ts',
    'no-skipped-tests.test.ts',
    'no-spread-in-variadic.test.ts',
    'no-sync-io-in-async.test.ts',
    'no-unbounded-array-chains.test.ts',
    'no-undefined-optional-assignment.test.ts',
    'no-unix-shell-command.test.ts',
    'prefer-execfile-over-exec.test.ts',
    'require-boundary-schema.test.ts',
    'require-path-normalization.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import rule from '../../src/rules/enforce-doc-exports'
import rule, { addEdge, clearImportGraph, detectCycle } from '../../src/rules/no-circular-deps'
import rule from '../../src/rules/no-disabled-tests'
import rule from '../../src/rules/no-empty-describe'
import rule from '../../src/rules/no-focused-tests'
import rule from '../../src/rules/no-forbidden-imports'
import rule from '../../src/rules/no-hardcoded-path-separator'
import rule from '../../src/rules/no-hardcoded-test-count'
import rule from '../../src/rules/no-layer-violation'
import rule from '../../src/rules/no-nested-loops-in-critical'
import rule from '../../src/rules/no-process-env-in-spawn'
import rule from '../../src/rules/no-process-exit'
import rule from '../../src/rules/no-skipped-tests'
import rule from '../../src/rules/no-spread-in-variadic'
import rule from '../../src/rules/no-sync-io-in-async'
import rule from '../../src/rules/no-unbounded-array-chains'
import rule from '../../src/rules/no-undefined-optional-assignment'
import rule from '../../src/rules/no-unix-shell-command'
import rule from '../../src/rules/prefer-execfile-over-exec'
import rule from '../../src/rules/require-boundary-schema'
import rule from '../../src/rules/require-path-normalization'
import { clearConfigCache } from '../../src/utils/config-loader'
import { clearWorkspaceCache } from '../../src/utils/workspace-packages'
import tsParser from '@typescript-eslint/parser'
import { RuleTester } from '@typescript-eslint/rule-tester'
import { Linter } from 'eslint'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'
```
