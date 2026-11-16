---
schemaVersion: 1
module: 'packages/cli/src/shared/craft/extract'
sourceHash: '5616eac0b530c46ce0b7022d3670e6428c518b3d5422cafb8477679d3ab73c05'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['outline-units.ts', 'source-roots.ts']
---

## Interface Contract

```ts
export FALLBACK_SOURCE_ROOTS
export extractOutlineUnits
export resolveSourceRoots
export usesOutlineExtraction
```

## Dependency Slice

```
import { CodeSymbol, SupportedLanguage, detectLanguage, getOutlineFromSource } from '@harness-engineering/core'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
