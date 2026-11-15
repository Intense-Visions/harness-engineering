---
schemaVersion: 1
module: 'packages/cli/src/code-craft/extract'
sourceHash: 'ac288c52d776b746359f91681edf91956d5764d86d1fb19e297407a9f1474306'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['discover.ts', 'siblings.ts', 'units.ts']
---

## Interface Contract

```ts
export buildCodeCraftCloneIndex
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
