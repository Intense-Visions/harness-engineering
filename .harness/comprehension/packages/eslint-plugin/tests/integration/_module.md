---
schemaVersion: 1
module: 'packages/eslint-plugin/tests/integration'
sourceHash: '2f9de299fe9c0f75374db8e803a26dd76f2b455b1c5f9fd236c148bca304489e'
compiledAt: '2026-08-28T01:22:11.524Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['monorepo-path-anchor.test.ts', 'plugin.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import plugin from '../../src/index'
import forbiddenImports from '../../src/rules/no-forbidden-imports'
import { clearConfigCache } from '../../src/utils/config-loader'
import { RuleTester } from '@typescript-eslint/rule-tester'
import { readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as path from 'path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
```
