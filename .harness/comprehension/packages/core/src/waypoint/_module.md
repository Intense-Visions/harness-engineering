---
schemaVersion: 1
module: 'packages/core/src/waypoint'
sourceHash: '3e72231c4277b4ab1dcdd15633f15f0954ec6fa4659228a77ee56635a43b0784'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'config-loader.test.ts',
    'config-loader.ts',
    'emitter.test.ts',
    'emitter.ts',
    'events.test.ts',
    'events.ts',
    'index.ts',
    'scrub.test.ts',
    'scrub.ts',
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
export DEFAULT_MAX_EVENTS
export EmissionFailure
export EmitSdlcOptions
export FileSpool
export FileSpoolOptions
export FleetProvenanceArtifact
export PersistedVerdict
export REDACTED
export ScrubOutcome
export SkillPhaseTransition
export SkillTransitionQualityGate
export ULID_LENGTH
export UlidFactoryOptions
export VerdictKind
export WaypointEmitter
export WaypointEmitterOptions
export WaypointEmitterPorts
export bestEffortScrub
export configureWaypointEmitter
export createUlidFactory
export emitFleetHandoffWritten
export emitFleetProvenanceWritten
export emitRoadmapClaim
export emitRoadmapRelease
export emitRoadmapStatusChange
export emitSdlc
export emitSkillPhaseTransition
export emitVerdictPersisted
export ensureWaypointEmitter
export getWaypointEmitter
export initWaypointEmitter
export isUlid
export loadWaypointConfig
export mergeSegments
export readSpoolSegments
export resetWaypointEmitterForTests
export validateSdlcEvent
export verdictGrade
```

## Dependency Slice

```
import { Err, Ok, Result, isErr, isOk } from '../shared/result'
import { loadWaypointConfig } from './config-loader'
import { WaypointEmitter, configureWaypointEmitter, emitSdlc, ensureWaypointEmitter, getWaypointEmitter, initWaypointEmitter, resetWaypointEmitterForTests } from './emitter'
import { emitFleetHandoffWritten, emitFleetProvenanceWritten, emitRoadmapClaim, emitRoadmapRelease, emitRoadmapStatusChange, emitSkillPhaseTransition, emitVerdictPersisted, verdictGrade } from './events'
import { REDACTED, bestEffortScrub } from './scrub'
import { FileSpool, mergeSegments, readSpoolSegments } from './spool'
import { ULID_LENGTH, createUlidFactory, isUlid } from './ulid'
import { validateSdlcEvent } from './validate'
import { FeatureStatus, FleetHandoffRecord, SDLC_EVENT_TYPES_V1, SDLC_SPECVERSION, SDLC_VERIFICATION_GRADES, SdlcActor, SdlcAppendResult, SdlcEvent, SdlcEventTypeV1, SdlcSpoolSegmentSnapshot, SdlcValidationIssue, SdlcValidationResult, SdlcVerificationGrade, WaypointConfig, WaypointConfigSchema } from '@harness-engineering/types'
import * as fs, { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import * as path, { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
