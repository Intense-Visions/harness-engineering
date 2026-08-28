---
schemaVersion: 1
module: 'examples/multi-tenant-api/src/services'
sourceHash: 'c6aab38ba57e2ad0a61805443924148a16d3fcd746e475d804599dcb5e05d47e'
compiledAt: '2026-08-28T01:22:08.588Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['user-service.ts']
---

## Summary

This module implements a tenant-scoped user service with in-memory storage. It provides create, read, and list operations for users, with each operation enforcing tenant isolation via required `tenantId` parameters. User IDs are globally sequential (via `nextId` counter), and inputs are validated with Zod before persistence. The store is a Map keyed by tenant; all read operations return defensive copies to prevent accidental mutations. It's designed for testing/examples, not production (in-memory, no persistence).

## Invariants

- Tenant isolation is mandatory: every operation validates tenantId is non-empty and scopes results to that tenant; missing tenantId throws immediately
- Global ID sequence across tenants: nextId is global, not per-tenant, ensuring user IDs never collide even across tenants
- Input validation gates writes: CreateUserSchema validates name (non-empty string) and email (RFC email format) before any user is created; parse failures throw
- Read operations return copies: listUsers returns [...tenantUsers] to prevent callers from mutating the internal store
- Undefined signals missing, not error: getUserById returns undefined for a missing user; throws only if tenantId is falsy
- Store and counter must stay synchronized: \_resetUsers must clear both together; if one resets and the other doesn't, ID uniqueness and tenant isolation can break

## Interface Contract

```ts
export _resetUsers
export createUser
export getUserById
export listUsers
```

## Dependency Slice

```
import { CreateUserInput, User } from '../types/user'
import { z } from 'zod'
```
