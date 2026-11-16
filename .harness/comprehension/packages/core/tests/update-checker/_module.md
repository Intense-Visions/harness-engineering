---
schemaVersion: 1
module: 'packages/core/tests/update-checker'
sourceHash: 'e12e69b501ca1e3ba55433811b503842fb9c52bd7162177b42482dc92b4ae408'
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
