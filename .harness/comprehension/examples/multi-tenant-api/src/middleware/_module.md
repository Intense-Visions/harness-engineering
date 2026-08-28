---
schemaVersion: 1
module: 'examples/multi-tenant-api/src/middleware'
sourceHash: '781b5c4f0138d81a196f03a7301916711b2ac7ff154166c096a8143649b51ab5'
compiledAt: '2026-08-28T01:22:08.586Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['tenant-context.ts']
---

## Interface Contract

```ts
export tenantContextMiddleware
```

## Dependency Slice

```
import { TenantContext } from '../types/tenant'
import { NextFunction, Request, Response } from 'express'
```
