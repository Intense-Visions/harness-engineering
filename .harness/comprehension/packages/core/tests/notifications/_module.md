---
schemaVersion: 1
module: 'packages/core/tests/notifications'
sourceHash: 'a0a1c8fde31bd60cb1438b3c8af0eeeafbe11d9bf1f2b4ef97d88b63b8409921'
compiledAt: '2026-08-28T01:22:10.870Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['config-loader.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { loadNotificationsConfig } from '../../src/notifications/config-loader'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
