---
schemaVersion: 1
module: 'packages/core/tests/ci'
sourceHash: '217e042f11cd9479dd5907ecaf0feef1ce378655b758abc4504aad5235d73c1b'
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
    'deps-config-parity.behavior.test.ts',
    'flake-attribution.test.ts',
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
import '../../src/architecture'
import { classifyBaseFreshness } from '../../src/ci/base-freshness'
import { runCIChecks } from '../../src/ci/check-orchestrator'
import { CorrelatedRun, FailingTest, attributeFailure, matchDiff, pairedSourceCandidates, parseFailingTests, testKey } from '../../src/ci/flake-attribution'
import { CINotifier } from '../../src/ci/notifier'
import { formatCIReportAsMarkdown } from '../../src/ci/report-formatter'
import { DEFAULT_VERDICT_CACHE_DIR, GATE_VERSIONS, MEMOIZABLE_CHECKS, VerdictCache, VerdictCacheStatsCollector, computeConfigHash, computeProjectInputHash, computeVerdictKey, parseVerdictCacheConfig, shouldCacheResult } from '../../src/ci/verdict-cache'
import '../../src/context/agents-map'
import '../../src/context/doc-coverage'
import { TrackerSyncAdapter } from '../../src/roadmap/tracker-sync'
import '../../src/security/config'
import { CICheckName, CICheckReport, CICheckResult, Err, Ok, ZERO_DENOMINATOR_EXIT_CODE } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
```
