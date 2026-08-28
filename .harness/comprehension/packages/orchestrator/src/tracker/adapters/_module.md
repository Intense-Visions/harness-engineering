---
schemaVersion: 1
module: "packages/orchestrator/src/tracker/adapters"
sourceHash: "607779f7f995259fdb845f125216ba8e94190ea09e8b2ba1352be2a9e391611e"
compiledAt: "2026-08-28T01:22:12.385Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["github-issues-issue-tracker.ts", "roadmap.ts"]
---

## Summary

The `packages/orchestrator/src/tracker/adapters` module provides two adapters implementing `IssueTrackerClient`. **GitHubIssuesIssueTrackerAdapter** wraps the wider `RoadmapTrackerClient` from core into orchestrator's small 6-method protocol, preserving the layering rule that core doesn't depend on orchestrator. **RoadmapTrackerAdapter** implements `IssueTrackerClient` over markdown roadmap files, parsing features, mapping them to `Issue` shapes, and persisting via a store abstraction that auto-detects sharded vs. monolith modes. Features get deterministic SHA256-based IDs. All lifecycle mutations (claim, release, complete) route through core authority functions to maintain invariants and audit trails.

## Invariants

- Layer preservation (R4): Adapters live in orchestrator to preserve the rule that core never imports from orchestrator
- Assignee-status coupling (RMH005): assignee ≠ null ⟺ in-progress; all status transitions route through core's setStatus() which auto-clears assignees leaving in-progress
- First-claim-wins (D4): isClaimableBy() compare-and-set guard owned by core ensures exactly one definition; claims rejected if third party holds assignment; no-op writes let callers detect rejection
- Deterministic feature IDs: Roadmap features hashed via SHA256(name) produce stable IDs across sessions and restarts
- Idempotent missing-target handling: Feature removed between dispatch and completion returns Ok(undefined); in-memory completion state prevents re-dispatch
- Audit trail for all mutations: Status and assignee changes never mutate directly; core functions log history records (e.g., 'unassigned' on release) ensuring audit symmetry
- Store abstraction for contention: resolveRoadmapStoreForFile() detects sharded vs. monolith mode; only changed rows rewrite in sharded mode, reducing write contention
- No direct field mutation: Bare feature.status = terminal while assignee is set violates RMH005; lifecycle authority functions prevent this

## Interface Contract

```ts
export GitHubIssuesIssueTrackerAdapter
export RoadmapTrackerAdapter
```

## Dependency Slice

```
import { BlockerRef, Issue, IssueTrackerClient, RoadmapTrackerClient, TrackedFeature, TrackerConfig, applyRoadmapDiff, claimFeature, isClaimableBy, resolveRoadmapStoreForFile, setFeatureStatus } from '@harness-engineering/core'
import { Err, FeatureStatus, Ok, Result, RoadmapFeature } from '@harness-engineering/types'
import { createHash } from 'node:crypto'
```
