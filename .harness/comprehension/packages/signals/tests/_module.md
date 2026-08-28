---
schemaVersion: 1
module: 'packages/signals/tests'
sourceHash: 'c7606eba1d53ab26a55afbcbcd69819ed53a0e7b4716f3824278019c28a3204b'
compiledAt: '2026-08-28T01:22:12.797Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'command-runner.test.ts',
    'gather.test.ts',
    'holiday-confidence.test.ts',
    'shared.test.ts',
    'timeline-store.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { CommandRunner, defaultCommandRunner } from '../src/command-runner'
import from '../src/gather'
import { OutcomeQueryStore, computeHolidayConfidence } from '../src/holiday-confidence'
import { bucketsToHistory, deriveEndpointTrend, round2, toDate } from '../src/shared'
import { SignalTimelineStore } from '../src/timeline-store'
import { CommandRunner, SignalId, SignalPoint, SignalProvider, SignalResult, SignalStatus } from '../src/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
