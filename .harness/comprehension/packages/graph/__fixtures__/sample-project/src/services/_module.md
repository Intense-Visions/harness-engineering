---
schemaVersion: 1
module: 'packages/graph/__fixtures__/sample-project/src/services'
sourceHash: '7aa0b488f30ab29b59d0413a2422d1fe64f0152d5e0dd12775087b68fd90d90d'
compiledAt: '2026-08-28T01:22:11.564Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['auth-service.ts', 'user-service.ts']
---

## Summary

The `services` module provides two complementary classes for user and authentication management. AuthService generates authentication tokens by hashing a password and extracting the first 16 characters, attaching a 1-hour expiry window—it's a stateless utility. UserService manages an in-memory user store (keyed by auto-incremented string IDs) and delegates login authentication to AuthService via a composed instance. The two services are tightly coupled: UserService instantiates AuthService as a private field, creating a single-tenant composition pattern with three operations: create user, retrieve user, and authenticate a user (throwing if the user doesn't exist).

## Invariants

- Token generation is deterministic per (password, timestamp)—AuthService.authenticate always produces the same token for the same password within the same second, since it slices the hash without randomness.
- User IDs are sequential integers (as strings), assigned via String(users.length + 1) at creation time; reusing or reordering IDs would break getUser lookups.
- Users are never deleted—the in-memory array only grows; no removal or mutation of existing User objects. A client calling login must have created that user first.
- AuthService is stateless; UserService is not. Each UserService instance carries its own user roster; sharing state across instances requires external coordination.
- Login requires user existence—UserService.login throws immediately if the user is not found, before attempting authentication.
- Token expiry is fixed at creation time (1 hour / 3600_000 ms) with no refresh or extension mechanism.

## Interface Contract

```ts
export AuthService
export UserService
```

## Dependency Slice

```
import { AuthToken, User } from '../types.js'
import { hashPassword } from '../utils/hash.js'
import { AuthService } from './auth-service.js'
```
