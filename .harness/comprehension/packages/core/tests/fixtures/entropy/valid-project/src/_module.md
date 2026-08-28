---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/valid-project/src'
sourceHash: '74d0416fa2b9e5d607e46cc8a860039d33223993c2aa4e83f05af326627d5181'
compiledAt: '2026-08-28T01:22:10.862Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['index.ts', 'types.ts', 'user.ts', 'utils.ts']
---

## Summary

This is a minimal but structurally sound user-management library demonstrating proper module organization and type safety. It exports a `User` interface and three functions to create users, look up users, and validate email addresses. The barrel entry point (`index.ts`) aggregates all public APIs. The implementation is stubbed (`findUserById` always returns null, `id` hardcoded to '1'), but the structure is canonical for a valid project. Key characteristic: email validation acts as a contract guard at creation time—invalid emails reject outright. Dependency flow: `user.ts` depends on types and utils; `index.ts` re-exports all three modules; no circular imports.

## Invariants

- Barrel export completeness: index.ts must export all four names from the interface contract (User type, createUser, findUserById, validateEmail)
- Type-at-source: User interface must be defined in types.ts and imported by user.ts, not inlined, maintaining separation of concerns
- Validation gate in createUser: email validation call must happen before object construction; if removed, the contract that 'only valid emails create users' breaks
- validateEmail import path: the utils.ts import in user.ts must resolve—if utils moves or the export changes, createUser silently breaks
- Return type honesty: functions must return their declared types (User vs User|null), or callers relying on the published interface crash at runtime

## Interface Contract

```ts
export User
export createUser
export findUserById
export validateEmail
```

## Dependency Slice

```
import { User } from './types'
import { validateEmail } from './utils'
```
