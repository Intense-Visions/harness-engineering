---
schemaVersion: 1
module: 'packages/graph/__fixtures__/sample-project/src/services'
sourceHash: '7aa0b488f30ab29b59d0413a2422d1fe64f0152d5e0dd12775087b68fd90d90d'
compiledAt: '2026-08-28T01:22:11.564Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['auth-service.ts', 'user-service.ts']
---

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
