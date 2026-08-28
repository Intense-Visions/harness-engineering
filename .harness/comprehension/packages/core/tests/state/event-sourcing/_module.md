---
schemaVersion: 1
module: 'packages/core/tests/state/event-sourcing'
sourceHash: 'edd1fb3dce26bc6a5abd979fde6fcef738ff195dee8cc23c40e9af852ea21466'
compiledAt: '2026-08-28T01:22:11.105Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'concurrency.test.ts',
    'events.test.ts',
    'lane-machine.test.ts',
    'log.test.ts',
    'migrate.test.ts',
    'replay-order.test.ts',
    'snapshot.property.test.ts',
    'snapshot.test.ts',
    'transition.test.ts',
    'triage.test.ts',
    'writer-id.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { EVENT_BLOBS_DIR, MAX_LINE_BYTES, SNAPSHOT_FILE } from '../../../src/state/event-sourcing/constants'
import { Event, EventInput, EventSchema, ScopeSchema, StoredEventSchema, TriageOutcomeInput, TriagePredictedInput } from '../../../src/state/event-sourcing/events'
import { Lane, checkTransition, dependencyGuard, evidenceGuard, forceGuard, isAllowedTransition, isTerminal } from '../../../src/state/event-sourcing/lane-machine'
import { emitEvent, eventLogPaths, loadEvents, readTailSeq, resetLocalCountersForTests } from '../../../src/state/event-sourcing/log'
import { __resetGenesisMemoForTests, importLegacyState, resetEventLog } from '../../../src/state/event-sourcing/migrate'
import { projectAudit } from '../../../src/state/event-sourcing/projections/audit'
import { projectCoreState, toHarnessState } from '../../../src/state/event-sourcing/projections/core-state'
import { projectLanes } from '../../../src/state/event-sourcing/projections/lanes'
import { __flushMaterializeForTests, __resetMaterializeTimersForTests, isStale, materialize, readSnapshot, reduce } from '../../../src/state/event-sourcing/snapshot'
import { registerTask, transitionLane } from '../../../src/state/event-sourcing/transition'
import { StoredTriageRecord, loadTriageRecords, projectTriageRecords, recordTriageOutcome, recordTriagePrediction } from '../../../src/state/event-sourcing/triage'
import { __resetWriterIdForTests, getWriterId } from '../../../src/state/event-sourcing/writer-id'
import { STATE_FILE } from '../../../src/state/state-shared'
import { DEFAULT_STATE, HarnessState } from '../../../src/state/types'
import { spawn } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
