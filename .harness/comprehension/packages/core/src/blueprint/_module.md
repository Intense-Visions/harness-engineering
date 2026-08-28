---
schemaVersion: 1
module: 'packages/core/src/blueprint'
sourceHash: 'c93a9d4e5ef6cfacb1523ffe572e3f87fddd90498575e04cc6e5fdac0cbc1871'
compiledAt: '2026-08-28T01:22:10.275Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'content-pipeline.ts',
    'generator.ts',
    'impact-lab-generator.test.ts',
    'impact-lab-generator.ts',
    'scanner.ts',
    'templates.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export BlueprintGenerator
export ContentPipeline
export ProjectScanner
export SCRIPTS
export SHELL_TEMPLATE
export STYLES
export categorizeImpact
export generateImpactData
```

## Dependency Slice

```
import { llmService } from '../shared/llm'
import { ContentPipeline } from './content-pipeline'
import { ImpactSourceNode, categorizeImpact, generateImpactData } from './impact-lab-generator'
import { SCRIPTS, SHELL_TEMPLATE, STYLES } from './templates'
import { BlueprintData, BlueprintModule, BlueprintOptions, Content } from './types'
import * as ejs from 'ejs'
import * as fs from 'fs/promises'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
```
