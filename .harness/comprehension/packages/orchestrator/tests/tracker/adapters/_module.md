---
schemaVersion: 1
module: "packages/orchestrator/tests/tracker/adapters"
sourceHash: "66007d0481fcf24d87511b8cabaf75f4709398e09b23f0d52dd9e744a98a0819"
compiledAt: "2026-08-28T01:22:12.738Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["github-issues-issue-tracker.test.ts"]
---

## Summary

This module tests the GitHubIssuesIssueTrackerAdapter, a thin delegation layer that adapts the generic RoadmapTrackerClient interface to the orchestrator's issue-tracking contract. The adapter provides six operations: fetching candidates by active state, fetching by arbitrary states, bulk state lookups by ID, claiming issues (assign to orchestrator), releasing them, and marking complete. The adapter is nearly a pure shim—it has no business logic, only field mapping (TrackedFeature → Issue, renaming name→title, status→state) and error propagation.

## Invariants

- Config drives active states: fetchCandidateIssues() must call client.fetchByStatus() with exactly the activeStates list from config, not hard-coded states.
- ExternalId round-trips immutably: All issue IDs flow through unchanged as externalId (e.g., 'github:owner/repo#1'); mapping must preserve this for downstream orchestrator tracking.
- ConflictError propagates with full shape: When the client returns a ConflictError, the adapter must forward it unchanged as an instance—not as generic Error. The dashboard's conflict-resolution UX reads externalId, diff, and serverUpdatedAt directly off the error object; dropping or transforming these fields breaks the UX.
- Bulk fetch uses fetchAll, not N individual fetches: fetchIssueStatesByIds() must call client.fetchAll() once and filter, not loop; this is both a performance contract and a caching signal.
- Errors from client are transparent: Any error from the underlying client (network, conflict, validation) must propagate to the caller unchanged—the adapter adds no retry, recovery, or wrapping logic.

## Interface Contract

```ts

```

## Dependency Slice

```
import { GitHubIssuesIssueTrackerAdapter } from '../../../src/tracker/adapters/github-issues-issue-tracker'
import { ConflictError, FeaturePatch, HistoryEvent, NewFeatureInput, RoadmapTrackerClient, TrackedFeature, TrackerConfig } from '@harness-engineering/core'
import { Err, FeatureStatus, Ok, Result } from '@harness-engineering/types'
import { describe, expect, it, vi } from 'vitest'
```
