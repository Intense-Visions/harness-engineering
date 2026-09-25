---
schemaVersion: 1
module: 'packages/signals/src'
sourceHash: '12f6ac77af29bdec3cc49b54bfd3ef48e11f0ba3802d0f8f423c4f7c12fb7d8e'
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
export DEFAULT_COMMAND_TIMEOUT_MS
export DEFAULT_WINDOW_DAYS
export HolidayConfidenceCriteria
export HolidayConfidenceInput
export HolidayConfidenceResult
export HolidayConfidenceStatus
export NETWORK_COMMAND_TIMEOUT_MS
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
import { CommandRunner, NETWORK_COMMAND_TIMEOUT_MS, defaultCommandRunner } from './command-runner'
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
