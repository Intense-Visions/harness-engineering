---
schemaVersion: 1
module: 'packages/graph/__fixtures__/extractor-project'
sourceHash: 'b08c56aecfdeaf0ce21087034cc0feb81556fc6d2e326644867bdc45babda336'
compiledAt: '2026-08-28T01:22:11.568Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'AuthTest.java',
    'Enums.java',
    'Routes.java',
    'RoutesMethodMapping.java',
    'Validators.java',
    'auth.test.ts',
    'auth_test.go',
    'auth_test.py',
    'auth_test.rs',
    'enums.go',
    'enums.py',
    'enums.rs',
    'enums.ts',
    'routes.go',
    'routes.py',
    'routes.rs',
    'routes.ts',
    'validators.go',
    'validators.py',
    'validators.rs',
    'validators.ts',
  ]
---

## Interface Contract

```ts
export AddressSchema
export OrderSchema
export PaymentMethod
export UserSchema
export default
```

## Dependency Slice

```
import { Router } from 'express'
import { describe, expect, it, test } from 'vitest'
import { z } from 'zod'
```
