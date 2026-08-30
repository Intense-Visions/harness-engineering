---
schemaVersion: 1
module: 'packages/burn/src'
sourceHash: 'de6f46148b24da899c9efbd33e4192876e2e63b2b4a41d85a4d5aaefe907ee50'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'config.ts',
    'cost-metrics.ts',
    'cost-per-pr.ts',
    'git.ts',
    'hooks.ts',
    'index.ts',
    'pr-linkage.ts',
    'provenance.ts',
    'read-summary.ts',
    'refresh.ts',
    'scan.ts',
    'statusline.ts',
    'store.ts',
    'summary.ts',
    'types.ts',
    'units.ts',
    'window.ts',
  ]
---

## Interface Contract

```ts
export AgentBlock
export AttributionBlock
export BudgetBlock
export BuildCostReportInput
export BurnConfig
export BurnPaths
export BurnStatus
export Calibration
export Confidence
export CostBand
export CostBandFinding
export CostBlock
export CostReport
export DEFAULT_CONFIG
export EscalationOutput
export GhRunner
export GitSegment
export LaneCost
export LinkOptions
export LinkResult
export ModelBlock
export NotifyState
export PriceTable
export ProvenanceEntry
export ScanInfo
export SessionBlock
export SessionBriefOutput
export SkillBlock
export SkillCost
export StatuslineInput
export Summary
export TokenTotals
export UsageRecord
export WEEK_MS
export W_CACHE_READ
export W_CACHE_WRITE
export W_IN
export W_OUT
export WeekReset
export atomicWrite
export buildCostReport
export buildSummary
export checkCostBands
export compactUnits
export costMetricsPath
export defaultGhRunner
export escalation
export gitSegment
export human
export linkPrs
export loadConfig
export parseTranscript
export priceRecord
export readFingerprints
export readProvenance
export readRawConfig
export readRecords
export readSummary
export recompute
export refresh
export refreshIfStale
export renderStatusline
export resolvePaths
export safeZone
export saveRawConfig
export scan
export scanInfoFromStore
export sessionBrief
export units
export wallToInstant
export weekBounds
export withScanLock
export writeCostReport
export writeSummary
```

## Dependency Slice

```
import { BurnPaths, loadConfig } from './config'
import { CostReport, priceRecord } from './cost-per-pr'
import { LinkResult } from './pr-linkage'
import { ProvenanceEntry } from './provenance'
import { scan, scanInfoFromStore } from './scan'
import { GitSegment } from './statusline'
import { STORE_VERSION, atomicWrite, readFingerprints, readRecords, withScanLock, writeFingerprints, writeRecords } from './store'
import { buildSummary, writeSummary } from './summary'
import { AgentBlock, AttributionBlock, BudgetBlock, BurnConfig, BurnStatus, Calibration, Confidence, CostBlock, ModelBlock, ScanInfo, SessionBlock, SkillBlock, Summary, UsageRecord } from './types'
import { human, units } from './units'
import { weekBounds } from './window'
import { execFileSync, spawnSync } from 'node:child_process'
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
```
