---
schemaVersion: 1
module: 'packages/burn/src'
sourceHash: '7cb81e7d62c032ecf166a9c901586e79f6721884339a404300d45786b626f601'
compiledAt: '2026-08-28T01:22:08.701Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The `burn` package tracks API token usage across Claude Code fleet runs, projects spend against budgets, and links cost to shipped work (merged PRs). It replaces a Python HUD with a Node implementation using fault-tolerant atomic writes, cross-process locking, and timezone-aware week arithmetic. The module exports snake_cased JSON shapes for backward compatibility and maintains two orthogonal spend views (by skill, by agent type) that reconcile to a single total.

## Invariants

- Atomic writes (temp→rename) prevent data loss on concurrent or crashed writes
- Cross-process lock via atomic mkdir + staleness reclaim prevents concurrent scan races
- Config parse failures silently fall back to defaults; a broken config cannot crash the HUD
- Store version compatibility must be checked before upgrade to prevent silent corruption
- Week reset timezone arithmetic must exactly match /usage; weekday 0=Mon..6=Sun
- Non-skill labels (main, unattributed, pre-migration) are never cost-per-PR candidates
- Cost attribution keys on laneId match in both fleet record and provenance entry
- Price lookup defaults to 0 USD for missing models; incomplete pricing is surfaced
- Projection escalation is confidence-weighted; low-confidence forecasts cap at OK status
- Degradation flag fires only on current-week unattributed subagent spend
- Window bounds accept NaN for unbounded (no limit) time windows
- LinkResult.ok=false means gh CLI failed; entry treated as unlinked, not zero-PRs

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
