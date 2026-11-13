---
schemaVersion: 1
module: 'packages/cli/src/code-craft/extract'
sourceHash: '4629e51a1bca12747c7b00a17e7770526266f47b9162acf5cd50d41d26e4cca9'
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
```

## Dependency Slice

```
import { extractOutlineUnits, usesOutlineExtraction } from '../../shared/craft/extract/outline-units.js'
import { CodeUnit, UnitKind } from '../findings/schema.js'
import { discoverSourceFiles } from './discover.js'
import { CloneClass, CloneIndex, CloneMember, EXTENSION_MAP, buildCloneIndex } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```
