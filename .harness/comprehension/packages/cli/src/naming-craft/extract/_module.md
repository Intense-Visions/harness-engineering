---
schemaVersion: 1
module: 'packages/cli/src/naming-craft/extract'
sourceHash: '4480200925c566ddce2b9bf3af93b0d973f14b6f17d1c9d477a1c8992c24d3cd'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['convention.ts', 'identifiers.ts']
---

## Interface Contract

```ts
export classify
export extractIdentifiers
export isSupportedSourceFile
export sampleConventions
```

## Dependency Slice

```
import { IdentifierKind, NamingConvention, ProjectConvention } from '../findings/schema.js'
import { ExtractedIdentifier } from './identifiers.js'
import { detectLanguage } from '@harness-engineering/core'
import ts from 'typescript'
```
