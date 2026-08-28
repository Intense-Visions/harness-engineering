---
schemaVersion: 1
module: 'packages/core/tests/blueprint'
sourceHash: '805d4d2893d8e982cebade14e4ae554a13f7f692cb01ed9960bced9fc82815a5'
compiledAt: '2026-08-28T01:22:10.707Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['content-pipeline.test.ts', 'generator.test.ts', 'scanner.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { ContentPipeline } from '../../src/blueprint/content-pipeline'
import { BlueprintGenerator } from '../../src/blueprint/generator'
import { ProjectScanner } from '../../src/blueprint/scanner'
import { BlueprintModule } from '../../src/blueprint/types'
import * as fs from 'fs/promises'
import * as os from 'os'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
```
