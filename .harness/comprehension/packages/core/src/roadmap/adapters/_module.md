---
schemaVersion: 1
module: 'packages/core/src/roadmap/adapters'
sourceHash: '6817da6f7c184bac70dd98ef437ed3f9eb625265da6dfeb9a2d66dbac2897b68'
compiledAt: '2026-08-28T01:22:10.499Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members: ['github-issues.ts']
---

## Summary

GitHubIssuesSyncAdapter mediates between Harness roadmap features and GitHub Issues, handling bidirectional sync of planning metadata (title, labels, milestone, assignee, state). It wraps the GitHub REST API with rate-limit-aware retry logic, maintains a milestone name→ID cache within the adapter lifetime, and enforces a critical invariant: machine-owned claims (orchestrator assignments) never leak to GitHub's human assignee field. The adapter respects a config-driven status map to translate internal feature statuses to GitHub's open/closed states, and re-exports buildExternalId/parseExternalId from the canonical external-id module to keep the github:owner/repo#NNN format stable across sync and reconcile boundaries.

## Invariants

- Canonical external-ID format lives in one place — github:owner/repo#NNN is defined in ../external-id and re-exported here; callers importing from this adapter see a stable import site even if internal structure changes.
- Machine assignees never reach GitHub — pushAssigneeToExternal gates all assignee writes; resolveAssigneeLogin returns null for machine IDs as defense-in-depth, preventing orchestrator claims from clobbering human ownership.
- CI-safe mode via syncIssueState option — when options.syncIssueState === false, state patching is omitted (labels still converge), allowing CI agents to reconcile planning metadata without closing/reopening issues.
- Status-to-external-state mapping is config-driven — config.statusMap is the single source of truth for which feature statuses map to 'open' vs 'closed'; used consistently across labelsForStatus, closeIfDone, and updateTicket.
- Retry logic respects Retry-After header — fetchWithRetry prefers the header over computed backoff; unrecognized headers fall back to exponential backoff with jitter.
- Status-specific labels disambiguate open issues — when a non-backlog status maps to 'open', a status-specific label is added to distinguish it from other open statuses in GitHub's UI.
- Milestone cache is instance-scoped — loaded once per adapter instance and reused; ensures consistency within a sync session but allows independent instances to refresh independently.

## Interface Contract

```ts
export GitHubIssuesSyncAdapter
export buildExternalId
export parseExternalId
```

## Dependency Slice

```
import { pushAssigneeToExternal } from '../assignee-lifecycle'
import { buildExternalId, parseExternalId } from '../external-id'
import { TicketWriteOptions, TrackerSyncAdapter } from '../tracker-sync'
import { Err, ExternalTicket, ExternalTicketState, Ok, Result, RoadmapFeature, TrackerComment, TrackerSyncConfig } from '@harness-engineering/types'
```
