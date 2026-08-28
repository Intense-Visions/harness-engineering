---
schemaVersion: 1
module: 'examples/multi-tenant-api/src/api'
sourceHash: '92e079864fcec49554e46bbb6e6586927cc39396a54310de815dec4dbe850233'
compiledAt: '2026-08-28T01:22:08.586Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['routes.ts']
---

## Summary

This Express router provides a basic user CRUD API scoped to multi-tenancy. It exports a single router that enforces tenant context via middleware on all routes, then wires three endpoints: `POST /users` (create), `GET /users` (list), and `GET /users/:id` (fetch by id). All operations are automatically scoped to the current tenant via `req.tenant!.tenantId`. The POST handler includes error handling; GET handlers delegate 404 detection to the service layer.

## Invariants

- tenantContextMiddleware must populate req.tenant before these handlers execute — the non-null assertions (req.tenant!.tenantId) assume it runs first; failure or bypass crashes the handler
- All user operations are tenant-scoped via tenantId as the first argument to createUser, listUsers, and getUserById — tenant isolation is a security requirement; passing the wrong tenant ID leaks data across tenants
- Asymmetric error handling: POST catches and returns 400 on any Error; GET handlers do not catch, assuming success or letting errors propagate to a global handler
- getUserById must return a falsy value (null, undefined, false) for missing users — the route checks if (!user) to emit 404; if the service throws instead, 404 never fires
- Request shape assumed stable — POST assumes req.body is a user object; GET :id assumes req.params.id is a valid lookup key; no validation or schema enforcement visible at this layer

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
