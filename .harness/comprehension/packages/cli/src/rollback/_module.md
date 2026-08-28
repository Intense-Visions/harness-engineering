---
schemaVersion: 1
module: 'packages/cli/src/rollback'
sourceHash: 'b4cdeb4bc614b322727e8408a8d94341eddc4529ce0a82de0dcaa874b9bae5a3'
compiledAt: '2026-08-28T01:22:09.329Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['breadcrumb.ts', 'compose.ts', 'eval-gate.ts', 'io.ts', 'sweep.ts']
---

## Interface Contract

```ts
export ROLLBACK_EVENTS_FILE
export ROLLBACK_LABEL
export appendRollbackEvent
export buildRevertBody
export composeRevertPr
export computeRevertDryRun
export createNodeRollbackIO
export createPrResolver
export createTimelineReader
export detectCrossing
export isEvalArmEnabled
export linkRollbackEventToGraph
export parseWindow
export pointsInWindow
export runEvalTriggerIfEnabled
export runRollbackSweep
export windowStart
```

## Dependency Slice

```
import { HarnessConfig } from '../config/schema'
import from '../mcp/utils/graph-loader.js'
import { LaterMerge, ResolvedTarget, RollbackDecision, RollbackIO } from '@harness-engineering/core'
import { SignalId, SignalPoint, SignalTimelineStore } from '@harness-engineering/signals'
import { execFileSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
```
