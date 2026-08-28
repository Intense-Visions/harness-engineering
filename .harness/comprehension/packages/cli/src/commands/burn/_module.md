---
schemaVersion: 1
module: 'packages/cli/src/commands/burn'
sourceHash: '852c0c9438060d2ba842f7f756e629cb15b4d2e9357737d2d54dac996858367c'
compiledAt: '2026-08-28T01:22:08.805Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'budget.ts',
    'calibrate.ts',
    'commands.test.ts',
    'format.ts',
    'index.ts',
    'install.test.ts',
    'install.ts',
    'per-pr.test.ts',
    'per-pr.ts',
    'report.test.ts',
    'report.ts',
    'reset-day.ts',
    'weeks.ts',
  ]
---

## Summary

The `burn` command module manages token-usage budgeting and reporting for a local Claude HUD proxy tracking API consumption. It provides seven subcommands: budget (set/clear weekly token ceiling with support for suffixed units like "250M" and multipliers like "1.2x baseline"), calibrate (derive budget from real /usage readings), reset-day (configure week reset day), weeks (display historical usage), per-pr (PR token breakdown), report (cost summaries), and install (HUD integration). Core responsibility: translate user intent into config mutations with immediate rescan to keep statusline state fresh. Budget parsing is flexible; calibration is conservative (rejects zero spend, warns on precision loss, preserves expiry dates across re-runs).

## Invariants

- Rescan after every config mutation — refresh(paths) must follow saveRawConfig(), else statusline shows stale budget-derived status indefinitely
- Calibration requires non-zero WTD spend — zero denominator is 'an abstention, not a calibration'; refuse silently rather than derive false ceiling
- Budget-parse failure → no config write — invalid input returns exit code 1 and leaves config untouched; command is advisory, not autocorrecting
- Caveats are printed, not silently absorbed — low-percentage calibration (<10%) prints error margin and advises re-run; wrong week window (non-Monday reset) is printed; confident wrong ceiling is worse than no ceiling
- Calibration carries expiry forward — if prior calibration has valid_until or note (e.g. temporary promo), re-calibrating must preserve it; caveats rot silently if dropped
- Monday reset is the silent default — if no week_reset.weekday configured, assume 0 (Monday); print to user so they can correct if their /usage window differs
- Config round-trip is faithful — tests drive real functions against throwaway HUD trees (via CLAUDE*HUD*\* env vars), not mocks; config format and paths must round-trip exactly

## Interface Contract

```ts
export createBurnCommand
```

## Dependency Slice

```
import { createBudgetCommand, parseBudget, setBudget } from './budget'
import { calibrate, createCalibrateCommand } from './calibrate'
import { bar, localTime, pad } from './format'
import { applySettings, buildPlan, createInstallCommand } from './install'
import { createPerPrCommand, printPerPr } from './per-pr'
import { createReportCommand, printReport, renderReport } from './report'
import { createResetDayCommand, parseWeekday, setResetDay } from './reset-day'
import { createWeeksCommand, printWeeks } from './weeks'
import { AgentBlock, BuildCostReportInput, Calibration, CostReport, SkillBlock, Summary, buildCostReport, checkCostBands, human, linkPrs, loadConfig, readProvenance, readRawConfig, readRecords, readSummary, refresh, resolvePaths, saveRawConfig, units, weekBounds, writeCostReport } from '@harness-engineering/burn'
import chalk from 'chalk'
import { Command } from 'commander'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
