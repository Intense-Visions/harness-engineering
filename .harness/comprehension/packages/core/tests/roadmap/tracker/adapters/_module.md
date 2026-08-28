---
schemaVersion: 1
module: 'packages/core/tests/roadmap/tracker/adapters'
sourceHash: 'b7b34da0f08b0b1f5765c330f823df0aad1eaea88ef83cd0b9a98eee2faf83c7'
compiledAt: '2026-08-28T01:22:10.991Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'github-issues-conflict.test.ts',
    'github-issues-history.test.ts',
    'github-issues-state-guard.test.ts',
    'github-issues.e2e.test.ts',
    'github-issues.test.ts',
  ]
---

## Summary

The `packages/core/tests/roadmap/tracker/adapters` module tests GitHubIssuesTrackerAdapter, which syncs roadmap features to GitHub issues. It covers five core operations: (1) Claim/Release/Complete with ETag-based optimistic concurrency and terminal-state idempotence; (2) History tracking via `HistoryEvent` comments with pagination and chronological ordering; (3) CRUD ops with body-block metadata (status labels, priority, spec, blocked-by); (4) State guard preventing unattended mutation of issue state; (5) ETag caching with repo-scoped access controls. Tests mock the GitHub API and verify behavior via fetch call inspection.

## Invariants

- Conflict detection is ETag-driven, not stale-view-driven: a stale ifMatch with external assignee change triggers ConflictError; a stale ifMatch with matching server state proceeds to PATCH.
- 'Done' is terminal-sticky: complete() with stale ETag but server already closed returns success with no PATCH; patch+server comparison determines idempotence, not caller's prior view.
- Label sync failure does NOT wipe labels: when fetchRawLabels (status-update label GET) fails, PATCH omits the labels key entirely; zero-length array would erase all labels including the selector.
- State guard syncIssueState:false holds across error paths: both happy and error paths omit state from PATCH when the guard is enabled; stale ETags do not bypass it.
- History actors are captured pre-PATCH: release/complete record assignee from pre-mutation GET, not post-PATCH response, so history reflects who actually held the work.
- Confused-deputy guard enforced: adapters refuse operations with externalIds from different repos; no fetch is issued on repo mismatch.

## Interface Contract

```ts

```

## Dependency Slice

```
import { GitHubIssuesTrackerAdapter } from '../../../../src/roadmap/tracker/adapters/github-issues'
import { serializeBodyBlock } from '../../../../src/roadmap/tracker/body-metadata'
import { ConflictError, HistoryEvent } from '../../../../src/roadmap/tracker/client'
import { ETagStore } from '../../../../src/roadmap/tracker/etag-store'
import { describe, expect, it, vi } from 'vitest'
```
