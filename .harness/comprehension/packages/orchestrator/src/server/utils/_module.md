---
schemaVersion: 1
module: 'packages/orchestrator/src/server/utils'
sourceHash: '72e9fb993e59e868383dbbecbd4a6c7975d349363a7768c85212219dc9479580'
compiledAt: '2026-08-28T01:22:12.332Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['url-guard.ts']
---

## Interface Contract

```ts
export guardOutboundHost
export isPrivateAddress
export isPrivateHost
```

## Dependency Slice

```
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'
```
