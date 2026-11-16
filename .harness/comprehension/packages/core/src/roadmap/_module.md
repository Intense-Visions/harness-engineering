---
schemaVersion: 1
module: 'packages/core/src/roadmap'
sourceHash: '8ce5988cd200382a63b1ee93b9cf4bf8a68b568d8aed41c23239ebb5586e9a7a'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'assignee-lifecycle.ts',
    'assignment-history.ts',
    'blocker-resolution.ts',
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
export BlockedCandidate
export BlockerHoldReason
export BlockerRef
export BlockerResolutionOptions
export BlockerResolver
export ConflictError
export ETagStore
export ExternalSyncOptions
export FeaturePatch
export FileLessScoredCandidate
export GitHubIssuesSyncAdapter
export HeldBlocker
export HistoryEvent
export HistoryEventType
export Issue
export IssueTrackerClient
export MakeTrackerConflictBodyOptions
export NewFeatureInput
export PilotScoringOptions
export PnyonSyncAdapter
export PnyonSyncAdapterOptions
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
export SYNC_SUPPORTED_TRACKER_KINDS
export ScoredCandidate
export SlugAliases
export SyncChange
export SyncOptions
export TicketWriteOptions
export TrackedFeature
export TrackerClientConfig
export TrackerConfig
export TrackerConfigDiagnosis
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
export createBlockerResolver
export createTrackerClient
export decidePromotionForRow
export defaultIsArchive
export deriveRepoFromGitRemote
export detectRoadmapStorageMode
export diagnoseTrackerShape
export diagnoseTrackerSyncConfig
export explainTrackerSyncConfig
export findBlockedRoadmapCandidates
export fullSync
export getRoadmapMode
export getTrackerKindRegistration
export githubRepoPath
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
export shardSlugAliases
export syncFromExternal
export syncRoadmap
export syncRowToExternal
export syncToExternal
export waypointItemUrl
```

## Dependency Slice

```
import * as eventSourcing from '../state/event-sourcing'
import { emitRoadmapClaim, emitRoadmapRelease, emitRoadmapStatusChange } from '../waypoint/events'
import { assigneeInvariantHolds, isMachineAssignee, setStatus } from './assignee-lifecycle'
import { ASSIGNMENT_HISTORY_HEADING, parseAssignmentHistory, serializeAssignmentHistory } from './assignment-history'
import { BlockerReferenceResolver, BlockerResolutionOptions, createBlockerReferenceResolver, createBlockerResolver, isPilotStatus } from './blocker-resolution'
import { deriveRepoFromGitRemote } from './derive-repo'
import { GROUP_PREFIX, matchFeatureHeadings, serializeFeatureHeading } from './heading'
import { decodeListField, encodeListField } from './list-field'
import { detectRoadmapStorageMode } from './load-mode'
import { RoadmapMode, RoadmapModeConfig, getRoadmapMode } from './mode'
import { scoreRoadmapCandidatesFileLess } from './pilot-scoring-file-less'
import { isRegression } from './status-rank'
import { applyRoadmapDiff } from './store/apply-diff'
import { resolveRoadmapStore } from './store/factory'
import { slugifyFeatureName } from './store/monolith-store'
import { RoadmapStore } from './store/roadmap-store'
import { decodeSummaryField, encodeSummaryField } from './summary-field'
import { TrackedFeature } from './tracker'
import { ExternalSyncOptions, TicketWriteOptions, TrackerSyncAdapter, resolveReverseStatus } from './tracker-sync'
import { TrackerClientConfig } from './tracker/factory'
import { getTrackerKindRegistration, listRegisteredTrackerKinds } from './tracker/registry'
import { AssignmentRecord, Err, ExternalTicket, ExternalTicketState, FeatureStatus, Ok, Priority, Result, Roadmap, RoadmapFeature, RoadmapFrontmatter, RoadmapGroup, RoadmapMilestone, RoadmapOptionalFieldKey, RowSyncResult, SyncResult, TrackerComment, TrackerSyncConfig } from '@harness-engineering/types'
import * as fs from 'fs'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
```
