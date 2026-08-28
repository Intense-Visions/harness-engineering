---
schemaVersion: 1
module: 'packages/cli/src/align/codemods'
sourceHash: '2fd517dab88e38561fda6e1d99eeee59ff5aba0421a15a791e19fb99ad082d58'
compiledAt: '2026-08-28T01:22:08.698Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['common.ts', 't001-hex.ts', 't002-font-family.ts', 't003-px-spacing.ts']
---

## Interface Contract

```ts
export applyT001Codemod
export applyT002Codemod
export applyT003Codemod
export renderTokenReference
export replaceLine
export sourceLine
```

## Dependency Slice

```
import { DriftFinding } from '../../drift/findings/finding.js'
import { Classification } from '../classifier/pre-flight.js'
import { FixDiff } from '../findings/outcome.js'
import { renderTokenReference, replaceLine, sourceLine } from './common.js'
import * as path from 'node:path'
```
