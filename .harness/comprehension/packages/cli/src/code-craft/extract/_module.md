---
schemaVersion: 1
module: 'packages/cli/src/code-craft/extract'
sourceHash: '7c1b5740a14e78e68e411756ab46735a924562300961d45911a03c5b7f3ed5e2'
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
import { CodeUnit, UnitKind } from '../findings/schema.js'
import { discoverSourceFiles } from './discover.js'
import { CloneClass, CloneIndex, CloneMember, EXTENSION_MAP, buildCloneIndex, detectLanguage } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```
