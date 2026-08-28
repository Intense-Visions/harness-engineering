---
schemaVersion: 1
module: 'examples/multi-tenant-api/tests/integration'
sourceHash: '1dfa114c3cd7415684fd6795a16b1ba05af9a0d32cc44cc1c61edba69d34c50f'
compiledAt: '2026-08-28T01:22:08.589Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['tenant-isolation.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { _resetUsers, createUser, getUserById, listUsers } from '../../src/services/user-service'
import { beforeEach, describe, expect, it } from 'vitest'
```
