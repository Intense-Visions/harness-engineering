---
schemaVersion: 1
module: 'packages/core/src/duplication'
sourceHash: 'c6bc1b63e928712fe819e84abdeaa7e463f133c2242c1330531eb77d8be43301'
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
export MissingNodeLocationError
export buildCloneIndex
export extractUnits
export fingerprintFile
export fingerprintStream
export isEligibleFile
export normalizeTokens
export resolveDuplicationConfig
```

## Dependency Slice

```
import { EntropyError, createEntropyError } from '../shared/errors'
import { readFileContent, relativePosix } from '../shared/fs-utils'
import { Err, Ok, Result } from '../shared/result'
import { digest, normalize } from './tokens'
import { CloneUnitKind, extractUnitsImpl } from './units'
import { TSESTree, parse } from '@typescript-eslint/typescript-estree'
import { minimatch } from 'minimatch'
import { createHash } from 'node:crypto'
```
