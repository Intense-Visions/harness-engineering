---
schemaVersion: 1
module: 'packages/cli/src/drift/resolvers'
sourceHash: 'bb2916fd7c3822f85d28ed9f36b4adbb96dbfef8ce542bb489a4ebf8b1615848'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['component-registry.ts', 'tokens.tokenpath-1855.test.ts', 'tokens.ts']
---

## Interface Contract

```ts
export loadComponentRegistry
export loadTokenPathIndex
export loadTokenSet
```

## Dependency Slice

```
import { loadDesignTokenPath } from '../../config/analysis-schema.js'
import { runDetectDrift } from '../index.js'
import { loadTokenPathIndex, loadTokenSet } from './tokens.js'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
