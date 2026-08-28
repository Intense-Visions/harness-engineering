---
schemaVersion: 1
module: 'examples/multi-tenant-api/tests/integration'
sourceHash: '1dfa114c3cd7415684fd6795a16b1ba05af9a0d32cc44cc1c61edba69d34c50f'
compiledAt: '2026-08-28T01:22:08.589Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['tenant-isolation.test.ts']
---

## Summary

`examples/multi-tenant-api/tests/integration` validates tenant isolation in the multi-tenant user service. The test suite exercises the core contract: each tenant's data is completely opaque to other tenants. It uses `_resetUsers()` to clear state between tests and covers three critical cases: list visibility (tenant-1 cannot see tenant-2 users), record lookup (getUserById fails across tenant boundaries), and absence handling (querying an empty tenant returns `[]`, not all users or a leaked set).

## Invariants

- Tenant boundary is hermetic for listUsers — a tenant's list reflects only users it created; no leakage across tenants, no global fallback
- getUserById is tenant-scoped, not ID-scoped — same user ID in different tenants returns undefined, not the wrong user
- Empty tenant is safe — querying a tenant with zero users returns [] (not undefined, not users from other tenants, not an error)
- Test isolation via \_resetUsers() — before each test, state is cleared; no cross-test pollution (critical for concurrent or parallelized runs)

## Interface Contract

```ts

```

## Dependency Slice

```
import { _resetUsers, createUser, getUserById, listUsers } from '../../src/services/user-service'
import { beforeEach, describe, expect, it } from 'vitest'
```
