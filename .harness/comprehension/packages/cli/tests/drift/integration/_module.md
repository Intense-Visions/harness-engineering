---
schemaVersion: 1
module: 'packages/cli/tests/drift/integration'
sourceHash: '1902889201e333ee07208fe281726689a701948c9f18078fd3e0f40164cd553d'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['detect-drift.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { runDetectDrift } from '../../../src/drift'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
