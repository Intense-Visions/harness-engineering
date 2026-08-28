---
schemaVersion: 1
module: 'packages/cli/tests/drift/resolvers'
sourceHash: '02df7c0903d985d0141429edf1ff8428f576ea14e05830582147ceec9d7bf28d'
compiledAt: '2026-08-28T01:22:09.709Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['component-registry.test.ts', 'tokens.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { loadComponentRegistry } from '../../../src/drift/resolvers/component-registry'
import { loadTokenSet } from '../../../src/drift/resolvers/tokens'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
