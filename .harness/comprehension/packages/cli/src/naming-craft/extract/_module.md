---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/extract'
sourceHash: '08aa1c2c2477033510c5b5da22f7f3b028ab2f01347dd2dde9ef348b9269508b'
compiledAt: '2026-08-28T01:22:09.295Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['convention.ts', 'identifiers.ts']
---

## Interface Contract

```ts
export classify
export extractIdentifiers
export sampleConventions
```

## Dependency Slice

```
import { IdentifierKind, NamingConvention, ProjectConvention } from '../findings/schema.js'
import { ExtractedIdentifier } from './identifiers.js'
import ts from 'typescript'
```
