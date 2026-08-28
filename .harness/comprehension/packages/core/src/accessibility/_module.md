---
schemaVersion: 1
module: 'packages/core/src/accessibility'
sourceHash: '989826e76775e663006b6b58da937572af86df71404d61bb30b8c12d5a581294'
compiledAt: '2026-08-28T01:22:10.263Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'rules.ts', 'scanner.ts', 'types.ts']
---

## Interface Contract

```ts
export ARIA_SCANNABLE_EXTENSIONS
export AriaConfidence
export AriaFinding
export AriaRule
export AriaScanResult
export AriaScanner
export AriaSeverity
export ariaRules
```

## Dependency Slice

```
import { ariaRules } from './rules'
import { ARIA_SCANNABLE_EXTENSIONS, AriaFinding, AriaRule, AriaScanResult } from './types'
import * as fs from 'node:fs/promises'
import { extname } from 'node:path'
```
