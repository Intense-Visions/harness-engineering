---
schemaVersion: 1
module: 'packages/cli/src/security-craft/extract'
sourceHash: '8654d6b9276bae8551e0d3973a1594c06c1dd706d429d81a6b68fab81cee8605'
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
import { SecuritySignal, SignalKind } from '../findings/schema.js'
import * as fs from 'node:fs'
import * as path from 'node:path'
import ts from 'typescript'
```
