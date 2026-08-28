---
schemaVersion: 1
module: 'packages/eslint-plugin/src/utils'
sourceHash: 'afcce73e2bad670c3f04866421bc4a294cf25025c0264dc7604ff1572cf97502'
compiledAt: '2026-08-28T01:22:11.528Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['ast-helpers.ts', 'config-loader.ts', 'index.ts', 'path-utils.ts', 'schema.ts']
---

## Interface Contract

```ts
export *
```

## Dependency Slice

```
import { HarnessConfig, HarnessConfigSchema, Layer } from './schema'
import { AST_NODE_TYPES, TSESTree } from '@typescript-eslint/utils'
import * as fs from 'fs'
import { minimatch } from 'minimatch'
import * as path from 'path'
import { z } from 'zod'
```
