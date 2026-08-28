---
schemaVersion: 1
module: 'packages/cli/src/code-craft/extract'
sourceHash: 'ffcc22aac68d33e3e89a0e2329f80514ebc92c8b62d1fa19ceb0bd176c284571'
compiledAt: '2026-08-28T01:22:08.759Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['discover.ts', 'units.ts']
---

## Interface Contract

```ts
export discoverSourceFiles
export extractUnits
export unitSource
```

## Dependency Slice

```
import { CodeUnit, UnitKind } from '../findings/schema.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```
