---
schemaVersion: 1
module: 'packages/core/src/roadmap'
sourceHash: '1880488940754d399883e89435880d9f61d19fd44798087f500e70e948c11d26'
compiledAt: '2026-08-28T01:22:10.571Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'assignee-lifecycle.ts',
    'derive-repo.ts',
    'external-id.ts',
    'heading.ts',
    'health.ts',
    'index.ts',
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
    'sync-engine.ts',
    'sync.ts',
    'tracker-config.ts',
    'tracker-sync.ts',
  ]
---

## Summary

The `roadmap` module is the authoritative layer for feature planning and tracking. It manages the dual representation of features: a local markdown-based aggregate (monolith or sharded) and an external GitHub tracker. Core responsibilities include parsing/serializing roadmap markdown with canonical grammars, enforcing the assignee lifecycle invariant, bidirectional sync with GitHub (reconcile closed issues as done, push status changes, handle conflicts), roadmap health validation, feature scoring and promotion through release pipelines, and storage abstraction supporting both monolith and sharded modes. Acts as the boundary between the orchestrator (claim/release rows), GitHub adapter (outbound push), storage layer, and type system.

## Invariants

- Assignee Lifecycle (S4-001): assignee ≠ null ⟺ status === 'in-progress'. A feature carries an assignee iff actively executing. The assigneeInvariantHolds(), claim(), release(), and setStatus() functions form a chokepoint enforcing this at every state transition. Violation breaks sync, health checks, and orchestrator concurrency guards.
- First-Claim-Wins (S4-003): isClaimableBy(feature, assignee) enforces compare-and-set semantics—a row is claimable only if unassigned or already held by that assignee. Prevents race conditions where orchestrator and human (or peer orchestrators) dispatch onto the same row concurrently.
- Machine Assignee Opacity: Orchestrator IDs (orchestrator-{8-hex} or {name}-{8-hex}) are local-only and never synced to GitHub's assignee field. Only real GitHub logins push outbound via pushAssigneeToExternal(). isMachineAssignee() is the single source of truth to prevent dual-adapter drift.
- External-ID Format Canonicality: github:owner/repo#NNN is the one regex-defined format for tracking GitHub issues across sync and reconcile paths. parseExternalId() and buildExternalId() export the canonical grammar to prevent divergence between adapter and auto-done reconciler.
- H3 Heading Grammar Convergence: Lenient read (\s+ after ### and Feature:), strict emit (one space). matchFeatureHeadings() and serializeFeatureHeading() share the same grammar so parse → serialize → parse is an identity, preventing silent reclassification of tracked rows.
- Roadmap Storage Mode Consistency: Mode (monolith vs. sharded) is detected once and pinned throughout a session via detectRoadmapStorageMode() and getRoadmapMode(). Switching modes mid-session breaks row identity; the store factory enforces consistency.
- Assignment History Auditability: Every assignee change appends an AssignmentRecord to roadmap.assignmentHistory with action (assigned/unassigned), executor name, and timestamp. This immutable audit trail provides S4 claim/release compliance tracking.

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
export ReconcileResult
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
export TrackerSyncAdapter
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
export groomRoadmap
export isClaimableBy
export isMachineAssignee
export isRegression
export isUnactionablePlanned
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
import { assigneeInvariantHolds, isMachineAssignee, setStatus } from './assignee-lifecycle'
import { deriveRepoFromGitRemote } from './derive-repo'
import { GROUP_PREFIX, matchFeatureHeadings, serializeFeatureHeading } from './heading'
import { detectRoadmapStorageMode } from './load-mode'
import { RoadmapMode, RoadmapModeConfig, getRoadmapMode } from './mode'
import { scoreRoadmapCandidatesFileLess } from './pilot-scoring-file-less'
import { isRegression } from './status-rank'
import { applyRoadmapDiff } from './store/apply-diff'
import { resolveRoadmapStore } from './store/factory'
import { RoadmapStore } from './store/roadmap-store'
import { TrackedFeature } from './tracker'
import { ExternalSyncOptions, TicketWriteOptions, TrackerSyncAdapter, resolveReverseStatus } from './tracker-sync'
import { TrackerClientConfig } from './tracker/factory'
import { AssignmentRecord, Err, ExternalTicket, ExternalTicketState, FeatureStatus, Ok, Priority, Result, Roadmap, RoadmapFeature, RoadmapFrontmatter, RoadmapGroup, RoadmapMilestone, RowSyncResult, SyncResult, TrackerComment, TrackerSyncConfig } from '@harness-engineering/types'
import * as fs from 'fs'
import { execFileSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as path from 'path'
import { describe, expect, it } from 'vitest'
```
