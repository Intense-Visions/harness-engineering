---
schemaVersion: 1
module: 'packages/core/src/waypoint'
sourceHash: 'db8e86e2223d7a0151f2212369d657a55e5429feee9e071ad2bce085fb128b97'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'checkpoint.ts',
    'config-loader.test.ts',
    'config-loader.ts',
    'contract.test.ts',
    'contract.ts',
    'emitter.test.ts',
    'emitter.ts',
    'events.test.ts',
    'events.ts',
    'index.ts',
    'rejected-log.ts',
    'scrub.test.ts',
    'scrub.ts',
    'shipper.test.ts',
    'shipper.ts',
    'spool.test.ts',
    'spool.ts',
    'ulid.test.ts',
    'ulid.ts',
    'validate.test.ts',
    'validate.ts',
  ]
---

## Interface Contract

```ts
export CHECKPOINT_FILENAME
export ContractVerdict
export ContractViolation
export DEFAULT_BATCH_SIZE
export DEFAULT_MAX_EVENTS
export EMPTY_CHECKPOINT
export EmissionFailure
export EmitSdlcOptions
export FileSpool
export FileSpoolOptions
export FleetProvenanceArtifact
export IngestEventResult
export IngestReportBody
export IngestResultKind
export PersistedVerdict
export REDACTED
export REJECTED_FILENAME
export RejectedEvent
export RejectedRecord
export ScrubOutcome
export ShipCheckpoint
export ShipError
export ShipFetch
export ShipOptions
export ShipReport
export SkillPhaseTransition
export SkillTransitionQualityGate
export ULID_LENGTH
export UlidFactoryOptions
export VerdictKind
export WaypointEmitter
export WaypointEmitterOptions
export WaypointEmitterPorts
export advanceMark
export bestEffortScrub
export configureWaypointEmitter
export countRejected
export countUnshipped
export createUlidFactory
export describeViolations
export emitFleetHandoffWritten
export emitFleetProvenanceWritten
export emitRoadmapClaim
export emitRoadmapRelease
export emitRoadmapStatusChange
export emitSdlc
export emitSkillPhaseTransition
export emitVerdictPersisted
export ensureWaypointEmitter
export eventIdOf
export getWaypointEmitter
export hasLanded
export ingestUrl
export initWaypointEmitter
export isTerminal
export isUlid
export loadWaypointConfig
export mergeSegments
export readCheckpoint
export readSpoolSegments
export recordRejected
export rejectedLogPath
export resetWaypointEmitterForTests
export sdlcContract
export shipSpool
export unshippedLines
export validateAgainstContract
export validateSdlcEvent
export verdictGrade
export writeCheckpoint
```

## Dependency Slice

```
import { Err, Ok, Result, isErr, isOk } from '../shared/result'
import { ShipCheckpoint, advanceMark, eventIdOf, readCheckpoint, unshippedLines, writeCheckpoint } from './checkpoint'
import { loadWaypointConfig } from './config-loader'
import { describeViolations, sdlcContract, validateAgainstContract } from './contract'
import schemaDocument from './contract/sdlc-v1.schema.json'
import { WaypointEmitter, configureWaypointEmitter, emitSdlc, ensureWaypointEmitter, getWaypointEmitter, initWaypointEmitter, resetWaypointEmitterForTests } from './emitter'
import { emitFleetHandoffWritten, emitFleetProvenanceWritten, emitRoadmapClaim, emitRoadmapRelease, emitRoadmapStatusChange, emitSkillPhaseTransition, emitVerdictPersisted, verdictGrade } from './events'
import { countRejected, recordRejected } from './rejected-log'
import { REDACTED, bestEffortScrub } from './scrub'
import { IngestEventResult, RejectedEvent, ShipError, ShipFetch, countUnshipped, hasLanded, ingestUrl, isTerminal, shipSpool } from './shipper'
import { FileSpool, mergeSegments, readSpoolSegments } from './spool'
import { ULID_LENGTH, createUlidFactory, isUlid } from './ulid'
import { validateSdlcEvent } from './validate'
import { FeatureStatus, FleetHandoffRecord, SDLC_EVENT_TYPES_V1, SDLC_SPECVERSION, SDLC_VERIFICATION_GRADES, SdlcActor, SdlcAppendResult, SdlcEvent, SdlcEventTypeV1, SdlcSpoolSegmentSnapshot, SdlcValidationIssue, SdlcValidationResult, SdlcVerificationGrade, WaypointConfig, WaypointConfigSchema, WaypointShipConfig } from '@harness-engineering/types'
import * as fs, { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import * as path, { basename, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
