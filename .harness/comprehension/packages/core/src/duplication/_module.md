---
schemaVersion: 1
module: 'packages/core/src/duplication'
sourceHash: '486dbbe5392457c4cfe53687579b678756da8cdbebb09bea929e38c6563738c6'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['tokens.ts']
---

## Interface Contract

```ts
export IDENTIFIER_PLACEHOLDER
export LITERAL_PLACEHOLDER
export fingerprintStream
export normalizeTokens
```

## Dependency Slice

```
import { TSESTree } from '@typescript-eslint/typescript-estree'
import { createHash } from 'node:crypto'
```
