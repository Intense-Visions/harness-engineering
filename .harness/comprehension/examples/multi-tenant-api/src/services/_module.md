---
schemaVersion: 1
module: 'examples/multi-tenant-api/src/services'
sourceHash: 'c6aab38ba57e2ad0a61805443924148a16d3fcd746e475d804599dcb5e05d47e'
compiledAt: '2026-08-28T01:22:08.588Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['user-service.ts']
---

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
