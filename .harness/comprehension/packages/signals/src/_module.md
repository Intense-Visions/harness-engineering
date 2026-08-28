---
schemaVersion: 1
module: 'packages/signals/src'
sourceHash: '1b711786e5b98bdc27a20231ce95af3b8e3ecbeac9d3fb6987347ebd8a3d0f18'
compiledAt: '2026-08-28T01:22:12.775Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'command-runner.ts',
    'gather.ts',
    'holiday-confidence.ts',
    'index.ts',
    'registry.ts',
    'shared.ts',
    'timeline-store.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export ASSESSMENT_MARKER
export CommandRunner
export DEFAULT_WINDOW_DAYS
export HolidayConfidenceCriteria
export HolidayConfidenceInput
export HolidayConfidenceResult
export HolidayConfidenceStatus
export OutcomeQueryStore
export SignalContext
export SignalId
export SignalPoint
export SignalProvider
export SignalResult
export SignalStatus
export SignalTimelineStore
export SignalsResult
export computeHolidayConfidence
export defaultCommandRunner
export gatherSignals
export signalRegistry
```

## Dependency Slice

```
import { CommandRunner, defaultCommandRunner } from './command-runner'
import { baselineUpdatesProvider } from './providers/baseline-updates'
import { complexityTrendProvider } from './providers/complexity-trend'
import { coverageTrendProvider } from './providers/coverage-trend'
import { evalFailRateProvider } from './providers/eval-fail-rate'
import { prReviewProvider } from './providers/pr-review'
import { signalRegistry } from './registry'
import { ASSESSMENT_MARKER, DEFAULT_WINDOW_DAYS, round2 } from './shared'
import { SignalTimelineStore } from './timeline-store'
import { CommandRunner, SignalContext, SignalId, SignalPoint, SignalProvider, SignalResult } from './types'
import { GraphStore, resolveGraphDir } from '@harness-engineering/graph'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { z } from 'zod'
```
