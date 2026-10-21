---
schemaVersion: 1
module: 'packages/core/tests/shared/parsers'
sourceHash: '5479e8de80a3042f6eb614a9076bdec2267431afb6296a67c95d0b1d01600014'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'typescript-health-default-loader.test.ts',
    'typescript-health.test.ts',
    'typescript-parser.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { TypeScriptParser } from '../../../src/shared/parsers/typescript'
import from '@typescript-eslint/typescript-estree'
import { createRequire } from 'node:module'
import { join } from 'path'
import { describe, expect, it, vi } from 'vitest'
```
