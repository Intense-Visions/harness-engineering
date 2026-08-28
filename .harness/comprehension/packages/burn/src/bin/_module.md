---
schemaVersion: 1
module: 'packages/burn/src/bin'
sourceHash: '2b1869978804fc631caf8b0f0f5752cfe1745164593c068610be91dbb3f9baa8'
compiledAt: '2026-08-28T01:22:08.626Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['burn-hud.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { loadConfig, resolvePaths } from '../config'
import { gitSegment } from '../git'
import { NotifyState, escalation, sessionBrief } from '../hooks'
import { readSummary } from '../read-summary'
import { refresh, refreshIfStale } from '../refresh'
import { renderStatusline } from '../statusline'
import { readFileSync, writeFileSync } from 'node:fs'
```
