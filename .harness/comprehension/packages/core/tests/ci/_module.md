---
schemaVersion: 1
module: 'packages/core/tests/ci'
sourceHash: '8a54a8342057301318fc99cd028d86418e5e5000982ca9cf744b9a83cca5644a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'base-freshness.behavior.test.ts',
    'check-orchestrator.test.ts',
    'check-skip-status.test.ts',
    'constraint-packs-orchestrator.test.ts',
    'constraint-packs-real-scanner.test.ts',
    'notifier.test.ts',
    'report-formatter.test.ts',
    'verdict-cache.test.ts',
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
import { DEFAULT_VERDICT_CACHE_DIR, GATE_VERSIONS, MEMOIZABLE_CHECKS, VerdictCache, VerdictCacheStatsCollector, computeConfigHash, computeProjectInputHash, computeVerdictKey, parseVerdictCacheConfig, shouldCacheResult } from '../../src/ci/verdict-cache'
import from '../../src/context/agents-map'
import from '../../src/context/doc-coverage'
import { TrackerSyncAdapter } from '../../src/roadmap/tracker-sync'
import { CICheckName, CICheckReport, CICheckResult, Err, Ok } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
