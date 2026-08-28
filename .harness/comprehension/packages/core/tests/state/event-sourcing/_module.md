---
schemaVersion: 1
module: 'packages/core/tests/state/event-sourcing'
sourceHash: 'edd1fb3dce26bc6a5abd979fde6fcef738ff195dee8cc23c40e9af852ea21466'
compiledAt: '2026-08-28T01:22:11.105Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The event-sourcing test suite validates a concurrent, event-sourced state architecture where all state changes are immutable events. It tests schema validation, multi-process safe writing with blob spilling for large payloads, lane state machine transitions with guarded edges, snapshot materialization, event ordering, and projections. Core invariants enforce no event loss, no sequence repetition, correct blob handling under concurrency, snapshot consistency, transition table enforcement, and dependency/evidence/force guards for lane state changes.

## Invariants

- No event loss under concurrent N-process writes; each (seq, writerId) pair is unique
- Global event ordering: sorted by (seq asc, writerId asc) regardless of write sequence
- Blob spill succeeds under concurrent writes; identical payloads collapse to single content-addressed blob
- Missing blob doesn't abort load; affected event is dropped, valid events remain readable
- Snapshots materialize correctly, reflecting all state transitions (Truth #7)
- Lane transition table: allowed edges (planned→claimed→in_progress→in_review→done); rework via in_review↔in_progress; any→{blocked,canceled}
- Off-table transitions rejected unless forced with actor + reason
- Entering in_progress requires all dependent tasks in done lane
- Entering done requires non-empty evidence array
- EventSchema validates type-payload match; StoredEventSchema recognizes new types on disk
- Projections are additive: audit events don't change coreState/lanes byte-representation
- Writer ID unique per process via HARNESS_EVENT_WRITER_ID; monotonic seq counters per writer
- Snapshot staleness tracking; materialize() refreshes on-demand within debounce window
- Event log/blob dir structure invariant (paths normalized; Windows posix-normalized)
- Scope envelope fields (stream, session) can be undefined; schema accepts both

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
