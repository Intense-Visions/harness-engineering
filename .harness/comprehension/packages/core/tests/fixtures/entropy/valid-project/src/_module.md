---
schemaVersion: 1
module: 'packages/core/tests/fixtures/entropy/valid-project/src'
sourceHash: '74d0416fa2b9e5d607e46cc8a860039d33223993c2aa4e83f05af326627d5181'
compiledAt: '2026-08-28T01:22:10.862Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'types.ts', 'user.ts', 'utils.ts']
---

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
