---
schemaVersion: 1
module: 'packages/core/tests/update-checker'
sourceHash: '7e06ea866e1f5f315378097b38800a5a86bc4cbea89f43fbb66746b08845faa9'
compiledAt: '2026-08-28T01:22:11.116Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['update-checker-edge-cases.test.ts', 'update-checker.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { UpdateCheckState, getUpdateNotification, invalidateCheckState, isUpdateCheckEnabled, readCheckState, shouldRunCheck, spawnBackgroundCheck } from '../../src/update-checker'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
