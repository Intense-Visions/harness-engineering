---
schemaVersion: 1
module: 'packages/core/tests/duplication'
sourceHash: '90b25dd052664847d6a24b1ecdf84dd70cf5ef5d7eb2de4c2d6f5ba9ea42150b'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['tokens.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { fingerprintStream, normalizeTokens } from '../../src/duplication/tokens'
import { parse } from '@typescript-eslint/typescript-estree'
import { describe, expect, it } from 'vitest'
```
