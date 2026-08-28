---
schemaVersion: 1
module: 'examples/multi-tenant-api/tests/services'
sourceHash: 'fc4f246b7e01f5bc0b20138a3c7262cc4287fd01a3e7a1754eb1be7eb89eddc3'
compiledAt: '2026-08-28T01:22:08.598Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['user-service.test.ts']
---

## Summary

This test suite validates a multi-tenant user service built on in-memory storage. The service enforces strict tenant isolation: users belong to exactly one tenant, and `listUsers(tenantId)` returns only that tenant's users—critical for security in a multi-tenant system. State is reset between tests via `_resetUsers()`. Input validation is delegated to Zod (email format, required tenantId), so the service assumes validated inputs downstream. The test covers the happy path and common validation errors but does not exercise `getUserById` (imported but untested—likely a gap) or edge cases like duplicate emails, soft deletes, or concurrent writes.

## Invariants

- Tenant isolation: Every user has a tenantId and listUsers(tenantId) returns only users from that tenant (zero cross-tenant leakage).
- TenantId is required: Non-empty string; createUser('', ...) throws with 'tenantId is required'.
- Email validation via Zod: Invalid emails reject at create time; validation is not optional.
- State isolation: \_resetUsers() fully resets the in-memory store; tests are independent.
- Implicit single-tenant per user: A user belongs to exactly one tenant; no multi-tenant user accounts.
- getUserById is imported but never tested—confirm it exists and is wired into the service.

## Interface Contract

```ts

```

## Dependency Slice

```
import { _resetUsers, createUser, getUserById, listUsers } from '../../src/services/user-service'
import { beforeEach, describe, expect, it } from 'vitest'
```
