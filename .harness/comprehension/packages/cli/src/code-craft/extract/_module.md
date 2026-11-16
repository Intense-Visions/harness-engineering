---
schemaVersion: 1
module: 'packages/cli/src/code-craft/extract'
sourceHash: '562950b13f50fc9fc1f415d857f81b00562f874d9135b97f6efaa4a2f02e568a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['discover.ts', 'siblings.ts', 'units.ts']
---

## Interface Contract

```ts
export buildCodeCraftCloneIndex
export buildCodeCraftCloneIndexOutcome
export discoverSourceFiles
export extractCodeUnits
export extractUnits
export resolveSiblingEvidence
export unitSource
export usesTsCompilerExtraction
```

## Dependency Slice

```
import { extractOutlineUnits, usesOutlineExtraction } from '../../shared/craft/extract/outline-units.js'
import { resolveSourceRoots } from '../../shared/craft/extract/source-roots.js'
import { CodeUnit, UnitKind } from '../findings/schema.js'
import { discoverSourceFiles } from './discover.js'
import { CloneClass, CloneIndex, CloneMember, EXTENSION_MAP, buildCloneIndex, detectLanguage } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```
