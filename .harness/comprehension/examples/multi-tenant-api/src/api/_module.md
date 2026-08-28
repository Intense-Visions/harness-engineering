---
schemaVersion: 1
module: 'examples/multi-tenant-api/src/api'
sourceHash: '92e079864fcec49554e46bbb6e6586927cc39396a54310de815dec4dbe850233'
compiledAt: '2026-08-28T01:22:08.586Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['routes.ts']
---

## Interface Contract

```ts
export router
```

## Dependency Slice

```
import { tenantContextMiddleware } from '../middleware/tenant-context'
import { createUser, getUserById, listUsers } from '../services/user-service'
import { Router } from 'express'
```
