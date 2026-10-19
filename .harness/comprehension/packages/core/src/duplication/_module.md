---
schemaVersion: 1
module: 'packages/core/src/duplication'
sourceHash: '9e1cf58e26d97cd194ba3a5044fab81b1a629fb8e5d253e3268c396ddb9d52c9'
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
export fingerprintFile
export fingerprintStream
export isEligibleFile
export normalizeTokens
export resolveDuplicationConfig
```

## Dependency Slice

```
import { readFileContent } from '../shared/fs-utils'
import { digest, normalize } from './tokens'
import { CloneUnitKind, extractUnitsImpl } from './units'
import { TSESTree, parse } from '@typescript-eslint/typescript-estree'
import { minimatch } from 'minimatch'
import { createHash } from 'node:crypto'
```
