---
schemaVersion: 1
module: 'packages/core/src/roadmap'
sourceHash: '7c66b80fdddef0e3cba73dfaa49e1220060d2677e74a9e2f15eb489e9a129fcf'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'assignee-lifecycle.ts',
    'derive-repo.ts',
    'external-id.ts',
    'heading.ts',
    'health.ts',
    'index.ts',
    'list-field.ts',
    'load-mode.test.ts',
    'load-mode.ts',
    'load-tracker-client-config.ts',
    'mode.ts',
    'parse.ts',
    'pilot-scoring-file-less.ts',
    'pilot-scoring.ts',
    'preservation.ts',
    'promote.ts',
    'reconcile.ts',
    'referenced-issues.ts',
    'serialize.ts',
    'status-rank.ts',
    'summary-field.ts',
    'sync-engine.ts',
    'sync.ts',
    'tracker-config.ts',
    'tracker-sync.ts',
  ]
---

## Interface Contract

```ts
export *
export BlockerRef
export ConflictError
export ETagStore
export ExternalSyncOptions
export FeaturePatch
export FileLessScoredCandidate
export GitHubIssuesSyncAdapter
export HistoryEvent
export HistoryEventType
export Issue
export IssueTrackerClient
export MakeTrackerConflictBodyOptions
export NewFeatureInput
export PilotScoringOptions
export PnyonTrackerAdapter
export PnyonTrackerClientConfig
export PnyonTrackerOptions
export ReconcileResult
export RegisteredTrackerClientConfig
export RoadmapGroomChange
export RoadmapGroomChangeKind
export RoadmapGroomOptions
export RoadmapGroomResult
export RoadmapHealthFinding
export RoadmapHealthOptions
export RoadmapHealthRuleId
export RoadmapHealthSeverity
export RoadmapMode
export RoadmapModeConfig
export RoadmapPromoteArgs
export RoadmapPromoteCoreResult
export RoadmapPromoteResult
export RoadmapPromoteRowDecision
export RoadmapPromoteTransition
export RoadmapStorageMode
export RoadmapTrackerClient
export STATUS_RANK
export ScoredCandidate
export SyncChange
export SyncOptions
export TicketWriteOptions
export TrackedFeature
export TrackerClientConfig
export TrackerConfig
export TrackerConflictBody
export TrackerKindRegistration
export TrackerSyncAdapter
export WaypointCommand
export WaypointCommandResult
export WaypointEvidenceEntry
export WaypointHttp
export WaypointHttpError
export WaypointItem
export WaypointItemPatch
export WaypointNewItem
export applySyncChanges
export assignFeature
export assigneeInvariantHolds
export buildExternalId
export checkRoadmapHealth
export claim
export createTrackerClient
export decidePromotionForRow
export defaultIsArchive
export deriveRepoFromGitRemote
export detectRoadmapStorageMode
export fullSync
export getRoadmapMode
export getTrackerKindRegistration
export groomRoadmap
export isClaimableBy
export isMachineAssignee
export isRegression
export isUnactionablePlanned
export listRegisteredTrackerKinds
export loadProjectRoadmapMode
export loadTrackerClientConfigFromProject
export loadTrackerSyncConfig
export makeTrackerConflictBody
export migrate
export parseExternalId
export parseOwnerRepoFromRemoteUrl
export parseReferencedIssues
export parseRoadmap
export promoteFeature
export pushAssigneeToExternal
export reconcileDoneFromClosedIssues
export registerTrackerKind
export release
export resolveReverseStatus
export scoreRoadmapCandidates
export scoreRoadmapCandidatesFileLess
export scoreRoadmapCandidatesForMode
export serializeRoadmap
export setStatus
export syncFromExternal
export syncRoadmap
export syncRowToExternal
export syncToExternal
```

## Dependency Slice

```
import * as eventSourcing from '../state/event-sourcing'
import { emitRoadmapClaim, emitRoadmapRelease, emitRoadmapStatusChange } from '../waypoint/events'
import { assigneeInvariantHolds, isMachineAssignee, setStatus } from './assignee-lifecycle'
import { deriveRepoFromGitRemote } from './derive-repo'
import { GROUP_PREFIX, matchFeatureHeadings, serializeFeatureHeading } from './heading'
import { decodeListField, encodeListField } from './list-field'
import { detectRoadmapStorageMode } from './load-mode'
import { RoadmapMode, RoadmapModeConfig, getRoadmapMode } from './mode'
import { scoreRoadmapCandidatesFileLess } from './pilot-scoring-file-less'
import { isRegression } from './status-rank'
import { applyRoadmapDiff } from './store/apply-diff'
import { resolveRoadmapStore } from './store/factory'
import { RoadmapStore } from './store/roadmap-store'
import { decodeSummaryField, encodeSummaryField } from './summary-field'
import { TrackedFeature } from './tracker'
import { ExternalSyncOptions, TicketWriteOptions, TrackerSyncAdapter, resolveReverseStatus } from './tracker-sync'
import { TrackerClientConfig } from './tracker/factory'
import { getTrackerKindRegistration, listRegisteredTrackerKinds } from './tracker/registry'
import { AssignmentRecord, Err, ExternalTicket, ExternalTicketState, FeatureStatus, Ok, Priority, Result, Roadmap, RoadmapFeature, RoadmapFrontmatter, RoadmapGroup, RoadmapMilestone, RowSyncResult, SyncResult, TrackerComment, TrackerSyncConfig } from '@harness-engineering/types'
import * as fs from 'fs'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
```
