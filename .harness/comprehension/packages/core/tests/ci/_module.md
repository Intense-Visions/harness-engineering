---
schemaVersion: 1
module: 'packages/core/tests/ci'
sourceHash: 'a9ed09e141975f868b8a588e085df0b800d2bf4ed82b4d7f9c558173812b89a9'
compiledAt: '2026-08-28T01:22:10.761Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'base-freshness.behavior.test.ts',
    'check-orchestrator.test.ts',
    'constraint-packs-orchestrator.test.ts',
    'constraint-packs-real-scanner.test.ts',
    'notifier.test.ts',
    'report-formatter.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { classifyBaseFreshness } from '../../src/ci/base-freshness'
import { runCIChecks } from '../../src/ci/check-orchestrator'
import { CINotifier } from '../../src/ci/notifier'
import { formatCIReportAsMarkdown } from '../../src/ci/report-formatter'
import from '../../src/context/agents-map'
import from '../../src/context/doc-coverage'
import { TrackerSyncAdapter } from '../../src/roadmap/tracker-sync'
import { CICheckName, CICheckReport, Err, Ok } from '@harness-engineering/types'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
