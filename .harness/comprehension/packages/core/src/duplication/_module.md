---
schemaVersion: 1
module: 'packages/core/src/duplication'
sourceHash: '52e8eb3a2e349d9570df32daf02cf052ad3044983883fc37abafc95d949aae20'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['tokens.ts', 'units.ts']
---

## Interface Contract

```ts
export IDENTIFIER_PLACEHOLDER
export LITERAL_PLACEHOLDER
export extractUnits
export fingerprintStream
export normalizeTokens
```

## Dependency Slice

```
import { TSESTree } from '@typescript-eslint/typescript-estree'
import { createHash } from 'node:crypto'
```
