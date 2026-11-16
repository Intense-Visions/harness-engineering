---
schemaVersion: 1
module: 'packages/cli/src/design-craft/measurement'
sourceHash: '3d59c011389fcdba6e447f85b58d400a7c71883360724e661878618ef2bc3a3f'
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
