---
schemaVersion: 1
module: 'packages/signals/tests'
sourceHash: '1b358f37e29e019208c9730e79027f96794ef95221ea7a24512213667de4691b'
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
import { CommandRunner, DEFAULT_COMMAND_TIMEOUT_MS, NETWORK_COMMAND_TIMEOUT_MS, defaultCommandRunner } from '../src/command-runner'
import from '../src/gather'
import { OutcomeQueryStore, computeHolidayConfidence } from '../src/holiday-confidence'
import { bucketsToHistory, deriveEndpointTrend, round2, toDate } from '../src/shared'
import { SignalTimelineStore } from '../src/timeline-store'
import { CommandRunner, SignalId, SignalPoint, SignalProvider, SignalResult, SignalStatus } from '../src/types'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
