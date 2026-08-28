---
schemaVersion: 1
module: 'packages/burn/tests'
sourceHash: 'e4bb840f6cade708ebc7d59761300cc6baf4760193b25351a260e75e703d90bb'
compiledAt: '2026-08-28T01:22:08.700Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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
    'pr-linkage.test.ts',
    'provenance.test.ts',
    'robustness.test.ts',
    'scan-attribution.test.ts',
    'scan.test.ts',
    'statusline.test.ts',
    'store-attribution.test.ts',
    'summary-attribution.test.ts',
    'summary-cost.test.ts',
    'summary-rollup.test.ts',
  ]
---

## Summary

packages/burn/tests is the test suite for the burn HUD, a token-cost and budget-management tool that tracks LLM spend across a week, forecasts remaining capacity, and escalates alarms. The tests verify four critical concerns: (1) binary performance—the harness-burn-hud CLI must stay fast (< 8× bare node startup) by bundling all dependencies; (2) budget and escalation logic—spend is fact (escalates immediately), forecasts are evidence (gain confidence over the week), with early-week alerts suppressing noise while still catching real overspend; (3) calibration lifecycle—calibrations expire and lose validity; (4) concurrent store safety—atomic writes and process-level locking prevent corruption when multiple agents update the spend record simultaneously. The suite uses makeHud() to set up isolated temporary filesystems, then drives the binary and library functions through realistic scenarios.

## Invariants

- No harness imports in binary — any @harness-engineering/\* import triggers a startup regression that breaks the statusline UX silently
- Noise suppression is asymmetric — early-week spend < 15% of week should never escalate; but spending 100% of budget early still escalates immediately (incurred spend is a fact)
- Forecast shrinkage toward baseline — when confidence is low, pulled forecast sits between linear extrapolation and prior-week median to avoid chasing spurious trends
- Per-model limits are hard constraints — a model can exhaust while pooled budget looks safe; exhaustion escalates independently
- Calibration validity gates reporting — expired calibrations must flag explicitly; fresh ones report days-until-expiry
- Atomic writes under concurrency — locking via withScanLock ensures transcript appends and store updates don't corrupt across parallel agent runs

## Interface Contract

```ts
export BIN
export DEFAULT_WEEK
export PACKAGE_ROOT
export agentLine
export daysAgo
export hoursAgo
export makeHud
export minutesAgo
export runBin
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
import { BIN, DEFAULT_WEEK, Hud, agentLine, daysAgo, hoursAgo, makeHud, minutesAgo, runBin, transcriptLine, utcIsoWeekday } from './helpers'
import { spawn } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { isBuiltin } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
```
