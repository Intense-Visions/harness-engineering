---
schemaVersion: 1
module: 'packages/cli/tests/drift/integration'
sourceHash: 'e049561b48887b25b126406554f2ee2c4249a12f8f5d66c0f4ed2b3f8ba78d1c'
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
