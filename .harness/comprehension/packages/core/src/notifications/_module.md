---
schemaVersion: 1
module: 'packages/core/src/notifications'
sourceHash: '1463c9ad5253369886f975a39e32bc0927cd21ec16e04bb3247af4a259b2e488'
compiledAt: '2026-08-28T01:22:10.430Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['config-loader.ts', 'index.ts']
---

## Interface Contract

```ts
export loadNotificationsConfig
```

## Dependency Slice

```
import { Err, Ok, Result } from '../shared/result'
import { NotificationsConfig, NotificationsConfigSchema } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
