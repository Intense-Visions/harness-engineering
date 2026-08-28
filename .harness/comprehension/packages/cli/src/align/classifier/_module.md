---
schemaVersion: 1
module: 'packages/cli/src/align/classifier'
sourceHash: '4c9c6fb3bbc01c8fbf93bdddabc79ff5bb74ea87f56dded12517f7498078f6d7'
compiledAt: '2026-08-28T01:22:08.669Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['pre-flight.ts', 'token-import.ts']
---

## Interface Contract

```ts
export classifyFinding
export findTokenImport
```

## Dependency Slice

```
import { DriftFinding } from '../../drift/findings/finding.js'
import { TokenPathIndex } from '../../drift/resolvers/tokens.js'
import { TokenImportInfo, findTokenImport } from './token-import.js'
```
