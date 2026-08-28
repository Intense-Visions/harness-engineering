---
schemaVersion: 1
module: 'packages/cli/src/commands/compound'
sourceHash: '32d9b436fb3bbcf221644e70cf4221997b6533d1c270e28e198d8f0fa8ff374c'
compiledAt: '2026-08-28T01:22:08.774Z'
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
import { assembleCandidateReport, computeHotspots, crossReferenceUndocumentedFixes, formatIsoWeek, gitScan, isoWeek } from '@harness-engineering/core'
import { Command } from 'commander'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
```
