---
schemaVersion: 1
module: 'packages/cli/src/code-craft/extract'
sourceHash: 'bce33255a25a47794fe7652f8f96609635ef893621c7702a2defd8d89ebf0522'
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
import { CloneClass, CloneIndex, CloneMember, buildCloneIndex } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```
