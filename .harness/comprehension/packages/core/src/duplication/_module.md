---
schemaVersion: 1
module: 'packages/core/src/duplication'
sourceHash: 'c5c44452e2e296f62c8b4511979eee3934e7add4bf50e2b49c844da84c59b457'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['estree.ts', 'imports.ts', 'index.ts', 'tokens.ts', 'units.ts']
---

## Interface Contract

```ts
export CloneUnitKind
export DEFAULT_DUPLICATION_CONFIG
export DupUnit
export EstreeUnavailableError
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
import { EstreeModule, EstreeModuleLoader } from '../shared/parsers/typescript'
import { Err, Ok, Result } from '../shared/result'
import { estreeGate } from './estree'
import { collectFileImports, sharedImportKey, usedImportKeys } from './imports'
import { digest, normalize } from './tokens'
import { CloneUnitKind, extractUnitsImpl } from './units'
import { TSESTree } from '@typescript-eslint/typescript-estree'
import { minimatch } from 'minimatch'
import { createHash } from 'node:crypto'
import { pathPosix, pathWin32 } from 'node:path'
```
