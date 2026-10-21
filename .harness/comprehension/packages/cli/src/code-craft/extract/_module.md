---
schemaVersion: 1
module: 'packages/cli/src/code-craft/extract'
sourceHash: '43a8f8f73476763beb81e15e51cae42370e220a3a6058410ee76b612246eb040'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['discover.ts', 'siblings.ts', 'units.ts']
---

## Interface Contract

```ts
export discoverSourceFiles
export extractUnits
export resolveSiblingEvidence
export unitSource
```

## Dependency Slice

```
import { CodeUnit, UnitKind } from '../findings/schema.js'
import { CloneClass, CloneIndex, CloneMember } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```
