---
schemaVersion: 1
module: 'packages/core/tests/fixtures/valid-layers/api'
sourceHash: 'b0c01c3ef10e258b93e0964267b9ff480bc4c91eede8238fd279e36b5defbe95'
compiledAt: '2026-08-28T01:22:10.863Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['user-handler.ts']
---

## Summary

This is a thin API handler layer that bridges HTTP request objects to domain services. The module exports a single handler function, `handleCreateUser`, which accepts a typed request object and delegates the actual registration work to the `registerUser` service from the layer below. It's a pure passthrough with no business logic—just translation and routing.

## Invariants

- Single export: handleCreateUser is the sole public interface; any caller must reference this name
- One-layer-down import: Dependencies point to ../services/ only; no horizontal (peer-api) or upward imports permitted
- Request shape is typed: { name: string } contracts the HTTP boundary; callers must provide this shape
- No business logic at this layer: The handler is a thin adapter; all logic lives in the service layer below
- Layer isolation: This module must not be imported by services or domain code (breaks layering); only consumed by higher layers (routers, middleware, orchestrators)

## Interface Contract

```ts
export handleCreateUser
```

## Dependency Slice

```
import { registerUser } from '../services/user-service'
```
