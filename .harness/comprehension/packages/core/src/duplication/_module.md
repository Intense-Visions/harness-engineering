---
schemaVersion: 1
module: 'packages/core/src/duplication'
sourceHash: 'fad7a3c0fd9ffad237b06f7ae32715bc0354e3a8948ee37a303d94a92dd599d3'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['imports.ts', 'index.ts', 'tokens.ts', 'units.ts']
---

## Interface Contract

```ts
export CloneUnitKind
export DEFAULT_DUPLICATION_CONFIG
export DupUnit
export FileImports
export IDENTIFIER_PLACEHOLDER
export LITERAL_PLACEHOLDER
export MAX_EVIDENCE_ENTRIES
export MissingNodeLocationError
export PARTIAL_EXTRACTION_PRIORITY_BOOST
export buildCloneIndex
export collectFileImports
export extractUnits
export fingerprintFile
export fingerprintStream
export isEligibleFile
export moduleKey
export normalizeTokens
export resolveDuplicationConfig
export sharedImportKey
export usedImportKeys
```

## Dependency Slice

```
import { EntropyError, createEntropyError } from '../shared/errors'
import { readFileContent, relativePosix } from '../shared/fs-utils'
import { Err, Ok, Result } from '../shared/result'
import { collectFileImports, sharedImportKey, usedImportKeys } from './imports'
import { digest, normalize } from './tokens'
import { CloneUnitKind, extractUnitsImpl } from './units'
import { TSESTree, parse } from '@typescript-eslint/typescript-estree'
import { minimatch } from 'minimatch'
import { createHash } from 'node:crypto'
import { pathPosix, pathWin32 } from 'node:path'
```
