---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/extract'
sourceHash: 'ebbe109a22b46a3fdace43b66823a24a999c613084d384d97b80b18538a8f239'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['outline-units.ts', 'scoped-files.ts', 'source-roots.ts']
---

## Interface Contract

```ts
export FALLBACK_SOURCE_ROOTS
export extractOutlineUnits
export resolveScopedFile
export resolveScopedFiles
export resolveSourceRoots
export usesOutlineExtraction
```

## Dependency Slice

```
import { CodeSymbol, SupportedLanguage, detectLanguage, getOutlineFromSource } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
