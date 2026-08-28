---
schemaVersion: 1
module: 'packages/core/tests/fixtures/valid-layers/services'
sourceHash: 'fbb1b3dd0d7555d47f9f5a6fa88ebdd09b30169f6e93d5283de463ac3fd3172e'
compiledAt: '2026-08-28T01:22:10.864Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['user-service.ts']
---

## Summary

The **services** module is a facade layer in a layered-architecture test fixture that mediates between application services and domain entities. It exports a single function, `registerUser(name)`, which delegates to the domain layer's `createUser()` factory without adding business logic. This is a test case validating **upward-only dependencies**: services depend on domain but domain does not depend on services.

## Invariants

- Uni-directional dependency rule: services layer imports only from domain layer (../domain/user), not from other tiers. This constraint is what the test fixture validates.
- No business logic at layer boundary: registerUser does not transform inputs, validate args, or apply side effects—it is a transparent pass-through to the domain factory.
- Type contract must remain: the User type export from domain is re-exported implicitly through the function's return type, ensuring type safety for callers.
- Single public export: registerUser is the module's only external API; any caller reaching into this layer uses this function exclusively.

## Interface Contract

```ts
export registerUser
```

## Dependency Slice

```
import { User, createUser } from '../domain/user'
```
