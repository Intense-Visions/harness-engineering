---
schemaVersion: 1
module: 'packages/core/src/state/event-sourcing'
sourceHash: '228de6347c9ed246eae868907b59e4f475b6c80c124f1bbb3c7272ad6e293b0b'
compiledAt: '2026-08-28T01:22:10.624Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'constants.ts',
    'events.ts',
    'index.ts',
    'lane-machine.ts',
    'log.ts',
    'migrate.ts',
    'snapshot.ts',
    'transition.ts',
    'triage.ts',
    'writer-id.ts',
  ]
---

## Summary

**event-sourcing** is an append-only event-store for harness session state, built on JSONL-based event logs with optional external blob storage. It provides three primary projections—core-state (decisions, blockers, progress), lanes (task lifecycle), and audit (user interactions)—and supports on-demand snapshot materialization to optimize replay.

The module handles scoped streams (session/stream pairs) and enforces atomic writes by spilling oversized payloads (>4096 bytes) to an external blob directory, storing only a reference marker on the log line. Events flow through a lane state machine for task sequencing and accrue triage outcomes for roadmap auto-classification.

## Invariants

- Append-only enforcement: Event log is authoritative; seq counter is monotonic per scope. Once written, an event cannot be modified or removed.
- Atomic payload spillover: Payloads ≥4096 bytes must be externalized to state.events.blobs/<hash>.json with a { "$blob": "<hash>" } reference stored inline; this keeps single log lines atomic across process crashes.
- Scope isolation: Each scope (stream + session pair) has its own log file and blob directory; events in one scope do not affect replays in another.
- Lane state machine: Task transitions must pass checkTransition() validation; illegal transitions are rejected or require explicit force flag. Terminal lanes (done, blocked, canceled) have no outgoing edges.
- WriterId stamping: Every event records the originating writer; audit projection depends on this for interaction tracing.
- Snapshot derivation: Snapshots are derived (read-only checkpoint) and always rebuilable from the log; staleness is checked via content hash. Materialization is debounced at 2000ms to batch rapid updates.
- Triage record accumulation: Triage events (predicted/outcome) accrete by externalId; a single roadmap item may have multiple triage events across phases, replayed and aggregated by the intelligence layer.
- Zod validation boundary: Stored events on disk use StoredEventSchema (payload may be reference), but in-memory events use strict EventSchema (payload fully rehydrated); this boundary is enforced at load time.

## Interface Contract

```ts
export *
export AuditEntry
export AuditKind
export AuditProjection
export BlobRef
export BlobRefSchema
export CoreStateProjection
export EmitResult
export Event
export EventInput
export EventLogOptions
export EventSchema
export EventType
export ForceOpts
export LANES
export Lane
export LaneHistoryEntry
export LaneRecord
export LaneSchema
export LanesProjection
export MATERIALIZE_DEBOUNCE_MS
export Scope
export ScopeSchema
export Snapshot
export StoredEvent
export StoredEventSchema
export StoredOutcome
export StoredPrediction
export StoredTriageRecord
export StoredVerdict
export TERMINAL_LANES
export TransitionOpts
export TriageOutcomeInput
export TriagePredictedInput
export checkTransition
export dependencyGuard
export emitEvent
export evidenceGuard
export forceGuard
export formatAuditTimeline
export getWriterId
export importLegacyState
export isAllowedTransition
export isBlobRef
export isStale
export isTerminal
export loadEvents
export loadTriageRecords
export materialize
export projectAudit
export projectCoreState
export projectLanes
export projectTriageRecords
export readSnapshot
export readTailSeq
export recordTriageOutcome
export recordTriagePrediction
export reduce
export registerTask
export resetEventLog
export toHarnessState
export transitionLane
```

## Dependency Slice

```
import { Err, Ok, Result } from '../../shared/result'
import { generateId } from '../../shared/uuid'
import { computeContentHash } from '../learnings-content'
import { STATE_FILE, getStateDir } from '../state-shared'
import { DEFAULT_STATE, HarnessStateSchema } from '../types'
import { BLOB_REF_KEY, EVENT_BLOBS_DIR, EVENT_LOG_FILE, MAX_LINE_BYTES, SNAPSHOT_FILE } from './constants'
import { Event, EventInput, EventSchema, LANES, Lane, LaneTransitionedInput, Scope, StoredEventSchema, TriageOutcomeInput, TriagePredictedInput, isBlobRef } from './events'
import { Lane, TransitionOpts, checkTransition } from './lane-machine'
import { EmitResult, EventLogOptions, emitEvent, eventLogPaths, loadEvents, readTailSeq } from './log'
import { AuditProjection, projectAudit } from './projections/audit'
import { CoreStateProjection, projectCoreState } from './projections/core-state'
import { LanesProjection, projectLanes } from './projections/lanes'
import { getWriterId } from './writer-id'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { z } from 'zod'
```
