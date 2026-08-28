---
schemaVersion: 1
module: 'packages/cli/src/security-craft/extract'
sourceHash: '2134239f7a16fc7353dda9449b0873b48f084604a90d1a679908843f0c6cef70'
compiledAt: '2026-08-28T01:22:09.333Z'
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
