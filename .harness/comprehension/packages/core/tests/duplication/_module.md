---
schemaVersion: 1
module: 'packages/core/tests/duplication'
sourceHash: '0f95c35f338ba23fc824112c8d0ff73fdd46ef5ab7e483a84d78718ecf0be17b'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['tokens.test.ts', 'units.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { fingerprintStream, normalizeTokens } from '../../src/duplication/tokens'
import { extractUnits } from '../../src/duplication/units'
import { parse } from '@typescript-eslint/typescript-estree'
import { describe, expect, it } from 'vitest'
```
