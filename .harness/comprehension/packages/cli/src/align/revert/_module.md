---
schemaVersion: 1
module: 'packages/cli/src/align/revert'
sourceHash: '6fa30f4ee7213a481843b695019184936ec187986ac85cc74e39579b8dd9a853'
compiledAt: '2026-08-28T01:22:08.703Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['inverse.ts', 'state.ts']
---

## Interface Contract

```ts
export LAST_BATCH_PATH
export applyInverse
export hashContent
export loadLastBatch
export saveLastBatch
```

## Dependency Slice

```
import { DriftFinding } from '../../drift/findings/finding.js'
import { replaceLine, sourceLine } from '../codemods/common.js'
import { AlignMode, FixDiff, FixOutcome } from '../findings/outcome.js'
import { createHash } from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
