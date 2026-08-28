---
schemaVersion: 1
module: 'packages/cli/src/design-craft/measurement'
sourceHash: '3dd11bd19602f9830f333a8cd8f0048e77b467d4ddbf0a6d59cf4b63f01f78b8'
compiledAt: '2026-08-28T01:22:09.090Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'signal.ts', 'usage.ts']
---

## Interface Contract

```ts
export CatalogStats
export CatalogUsageCounters
export ProposalCandidate
export SignalEvent
export getCatalogStats
export proposeFromRecurringFindings
export recordApply
export recordCite
export recordSignalEvent
export recordTrigger
export resetCatalogStats
export resetSignalStore
```

## Dependency Slice

```
import { CraftFinding } from '../findings/schema.js'
import * as crypto from 'node:crypto'
import * as fs from 'node:fs'
import * as path from 'node:path'
```
