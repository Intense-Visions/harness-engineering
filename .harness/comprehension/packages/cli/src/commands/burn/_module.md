---
schemaVersion: 1
module: 'packages/cli/src/commands/burn'
sourceHash: '852c0c9438060d2ba842f7f756e629cb15b4d2e9357737d2d54dac996858367c'
compiledAt: '2026-08-28T01:22:08.805Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
