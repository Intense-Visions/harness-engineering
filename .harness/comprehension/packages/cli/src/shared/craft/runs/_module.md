---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/runs'
sourceHash: '9ca18b9a1dd4624375f4ff8e8ce19bec5bef1602160d663544301ede6dc2bb3b'
compiledAt: '2026-08-28T01:22:09.343Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['store.ts']
---

## Interface Contract

```ts
export deleteRunState
export loadRunState
export loadRunStateOrThrow
export pruneOldRuns
export saveRunState
```

## Dependency Slice

```
import * as fs from 'node:fs'
import * as path from 'node:path'
```
