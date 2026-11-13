---
schemaVersion: 1
module: 'packages/cli/src/code-craft/extract'
sourceHash: '8b5ca21fb0ae4baf13bc6ddfcf9dbcee7a0cfaccb595e6e1d730616f53152cf4'
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
