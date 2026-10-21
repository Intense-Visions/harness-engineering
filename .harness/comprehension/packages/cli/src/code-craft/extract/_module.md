---
schemaVersion: 1
module: 'packages/cli/src/code-craft/extract'
sourceHash: 'd2d28ac129109d653f7cd06bb6dac27047a4d73314a080fdcde500e2f8bf913b'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['discover.ts', 'siblings.ts', 'units.ts']
---

## Interface Contract

```ts
export buildCodeCraftCloneIndex
export discoverSourceFiles
export extractUnits
export resolveSiblingEvidence
export unitSource
```

## Dependency Slice

```
import { CodeUnit, UnitKind } from '../findings/schema.js'
import { discoverSourceFiles } from './discover.js'
import { CloneClass, CloneIndex, CloneMember, buildCloneIndex } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```
