---
schemaVersion: 1
module: 'packages/cli/src/code-craft/extract'
sourceHash: '9e2e57f19d06c9dda1cb86d3214a6106a0029da1a1f16179a0838af2d598e04b'
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
