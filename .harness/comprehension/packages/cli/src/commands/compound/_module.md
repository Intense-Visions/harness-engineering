---
schemaVersion: 1
module: 'packages/cli/src/commands/compound'
sourceHash: '8f104cd302d2fac19f23d28d9d16f9f53cd40948901526a6f0c2e10dc5a87902'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['index.ts', 'scan-candidates.ts']
---

## Interface Contract

```ts
export createCompoundCommand
```

## Dependency Slice

```
import { createScanCandidatesCommand } from './scan-candidates'
import { assembleCandidateReport, computeStableHotspots, crossReferenceUndocumentedFixes, formatIsoWeek, gitScan, isoWeek } from '@harness-engineering/core'
import { Command } from 'commander'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
```
