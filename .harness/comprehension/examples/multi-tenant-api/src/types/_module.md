---
schemaVersion: 1
module: 'examples/multi-tenant-api/src/types'
sourceHash: 'd0a52b9600a1ed351fab8080df02852b30766e014ec2112e44bc1e4894c01e5a'
compiledAt: '2026-08-28T01:22:08.590Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['tenant.ts', 'user.ts']
---

## Summary

The `types` module defines the core domain model for a multi-tenant API. It establishes tenant isolation through a lightweight `TenantContext` carrier and defines `User` as a tenant-owned entity. The module enforces server-side responsibility for identity assignment by separating `CreateUserInput` (client-supplied: name, email) from the complete `User` entity (server-adds: id, tenantId), ensuring clients cannot forge tenant scope.

## Invariants

- Every User is immutably bound to exactly one tenant via tenantId; users cannot be reassigned across tenants
- User.id and User.tenantId are never supplied by clients—CreateUserInput omits both, forcing handlers to assign them server-side
- TenantContext is the minimal, required carrier of tenant identity for any scoped operation; middleware must extract and validate it before filtering/scoping data
- User IDs are unique within a tenant scope only; there is no global uniqueness constraint, making tenant-scoped lookups non-negotiable

## Interface Contract

```ts

```

## Dependency Slice

```

```
