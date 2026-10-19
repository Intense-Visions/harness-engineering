---
schemaVersion: 1
module: 'packages/core/tests/ci'
sourceHash: '7263b227a6325aa6eef3700a8ddc4cfea81224122d76d3df303759de68cdb029'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'arch-dependency-rules.behavior.test.ts',
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
import from '../../src/security/config'
import { CICheckName, CICheckReport, CICheckResult, Err, Ok } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
