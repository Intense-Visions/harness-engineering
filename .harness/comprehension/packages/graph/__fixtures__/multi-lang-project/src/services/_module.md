---
schemaVersion: 1
module: 'packages/graph/__fixtures__/multi-lang-project/src/services'
sourceHash: '8cdcdb1bab1c9047b6f020842422403c7df76b01fa83152b3de370ac5e137da0'
compiledAt: '2026-08-28T01:22:11.553Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['AuthService.java', 'AuthService.rs', 'auth-service.ts', 'auth_service.go', 'auth_service.py']
---

## Interface Contract

```ts
export AuthService
export MAX_SESSIONS
```

## Dependency Slice

```
import { AuthToken, User } from '../types'
import { hashPassword } from '../utils/hash'
```
