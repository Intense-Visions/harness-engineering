---
schemaVersion: 1
module: 'packages/core/src/duplication'
sourceHash: '543fc50ee6da3ef1269c4f13c57c04083f5e2c2ccad8faa9aa5e260c02edfe2c'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'tokens.ts', 'units.ts']
---

## Interface Contract

```ts
export CloneUnitKind
export DEFAULT_DUPLICATION_CONFIG
export DupUnit
export IDENTIFIER_PLACEHOLDER
export LITERAL_PLACEHOLDER
export extractUnits
export fingerprintStream
export isEligibleFile
export normalizeTokens
export resolveDuplicationConfig
```

## Dependency Slice

```
import { CloneUnitKind } from './units'
import { TSESTree } from '@typescript-eslint/typescript-estree'
import { minimatch } from 'minimatch'
import { createHash } from 'node:crypto'
```
