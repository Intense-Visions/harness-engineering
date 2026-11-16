---
schemaVersion: 1
module: 'packages/cli/src/security-craft/extract'
sourceHash: '6c3928cec9d23681b2887118648958a3e441cb7d7d1e1728a4caaf3775d6edd2'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['discover.ts', 'signals.ts']
---

## Interface Contract

```ts
export detectSignals
export discoverSourceFiles
```

## Dependency Slice

```
import { resolveSourceRoots } from '../../shared/craft/extract/source-roots.js'
import { SecuritySignal, SignalKind } from '../findings/schema.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```
