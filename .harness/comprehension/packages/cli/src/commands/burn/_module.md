---
schemaVersion: 1
module: 'packages/cli/src/commands/burn'
sourceHash: 'a8470ad110175d6783366e7882e37682a82a6f3c735b7eb6767473bbf29c17cf'
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
    'metabolism.test.ts',
    'metabolism.ts',
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
import { logger } from '../../output/logger'
import { createBudgetCommand, parseBudget, setBudget } from './budget'
import { calibrate, createCalibrateCommand } from './calibrate'
import { bar, localTime, pad } from './format'
import { applySettings, buildPlan, createInstallCommand } from './install'
import { MetabolismResult, createMetabolismCommand, metabolismSection, renderMetabolism } from './metabolism'
import { createPerPrCommand, printPerPr } from './per-pr'
import { createReportCommand, printFullReport, printReport, renderReport } from './report'
import { createResetDayCommand, parseWeekday, setResetDay } from './reset-day'
import { createWeeksCommand, printWeeks } from './weeks'
import { AgentBlock, BuildCostReportInput, Calibration, CostReport, SkillBlock, Summary, buildCostReport, checkCostBands, human, linkPrs, loadConfig, readProvenance, readRawConfig, readRecords, readSummary, refresh, resolvePaths, saveRawConfig, units, weekBounds, writeCostReport } from '@harness-engineering/burn'
import from '@harness-engineering/core'
import chalk from 'chalk'
import { Command } from 'commander'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, tmpdir } from 'node:os'
import path, { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
