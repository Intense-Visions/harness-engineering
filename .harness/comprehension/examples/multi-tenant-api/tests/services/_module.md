---
schemaVersion: 1
module: 'examples/multi-tenant-api/tests/services'
sourceHash: 'fc4f246b7e01f5bc0b20138a3c7262cc4287fd01a3e7a1754eb1be7eb89eddc3'
compiledAt: '2026-08-28T01:22:08.598Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['user-service.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { _resetUsers, createUser, getUserById, listUsers } from '../../src/services/user-service'
import { beforeEach, describe, expect, it } from 'vitest'
```
