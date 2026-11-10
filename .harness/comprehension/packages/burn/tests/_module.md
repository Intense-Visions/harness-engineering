---
schemaVersion: 1
module: 'packages/burn/tests'
sourceHash: 'e6d720f94a0ccf4a16f583fe8f77de081a45140d226f45c6b6f526ed87abceeb'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'bin-startup.test.ts',
    'budgets-models.test.ts',
    'concurrency.test.ts',
    'config-units.test.ts',
    'cost-metrics.test.ts',
    'cost-per-pr.test.ts',
    'helpers.ts',
    'hooks.test.ts',
    'lane-isolation.test.ts',
    'pr-linkage.test.ts',
    'provenance.test.ts',
    'robustness.test.ts',
    'run-process-stdin.test.ts',
    'scan-attribution.test.ts',
    'scan.test.ts',
    'statusline.test.ts',
    'store-attribution.test.ts',
    'summary-attribution.test.ts',
    'summary-cost.test.ts',
    'summary-rollup.test.ts',
  ]
---

## Interface Contract

```ts
export BIN
export DEFAULT_WEEK
export MID_WEEK
export PACKAGE_ROOT
export agentLine
export daysAgo
export guardChildStdin
export hoursAgo
export isClosedPipeError
export makeHud
export minutesAgo
export runBin
export runProcess
export transcriptLine
export utcIsoWeekday
```

## Dependency Slice

```
import { BurnPaths, DEFAULT_CONFIG, loadConfig, readRawConfig, resolvePaths, saveRawConfig } from '../src/config'
import { costMetricsPath, writeCostReport } from '../src/cost-metrics'
import { buildCostReport, checkCostBands } from '../src/cost-per-pr'
import { NotifyState, escalation, sessionBrief } from '../src/hooks'
import { GhRunner, LinkResult, linkPrs } from '../src/pr-linkage'
import { ProvenanceEntry, readProvenance } from '../src/provenance'
import { readSummary } from '../src/read-summary'
import { recompute, refresh, refreshIfStale } from '../src/refresh'
import { parseTranscript } from '../src/scan'
import { GitSegment, renderStatusline } from '../src/statusline'
import { readFingerprints, readRecords, withScanLock, writeRecords } from '../src/store'
import { buildSummary } from '../src/summary'
import { BurnConfig, ScanInfo, Summary, UsageRecord } from '../src/types'
import { human, units } from '../src/units'
import { safeZone, weekBounds } from '../src/window'
import { BIN, DEFAULT_WEEK, Hud, MID_WEEK, agentLine, daysAgo, guardChildStdin, hoursAgo, makeHud, minutesAgo, runBin, runProcess, transcriptLine, utcIsoWeekday } from './helpers'
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PassThrough, Writable } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
```
