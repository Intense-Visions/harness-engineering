---
schemaVersion: 1
module: 'packages/dashboard/tests/server/routes'
sourceHash: '2be5491cbd316e94dd312b21b53c08206a127f6ffcf5084a8a77ca2f59d3fdfc'
compiledAt: '2026-08-28T01:22:11.546Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'actions-claim.file-less.test.ts',
    'actions-claim.test.ts',
    'actions-refresh.test.ts',
    'actions-roadmap-status.file-less.test.ts',
    'actions-roadmap-status.test.ts',
    'actions.file-less-stub.test.ts',
    'actions.roadmap-status.file-less-stub.test.ts',
    'adoption.test.ts',
    'ci.test.ts',
    'graph.test.ts',
    'health-extended.test.ts',
    'health.test.ts',
    'impact.test.ts',
    'overview.test.ts',
    'roadmap.test.ts',
    'signals.test.ts',
    'signoff.test.ts',
  ]
---

## Summary

`packages/dashboard/tests/server/routes` contains integration and unit tests for the dashboard's HTTP route handlers. It covers endpoints for roadmap claiming, status updates, health checks, roadmap reads, and metadata routes (adoption, signals, graph, impact, CI, signoff). Tests verify correct HTTP status codes, response shapes, cache invalidation, GitHub sync behavior, and persistent state mutations through both file-based (monolith `roadmap.md`) and file-less (tracker client) execution paths. The module uses a dual pattern: file-based tests create real temp projects with actual roadmap files to test the full load→diff→serialize round-trip; file-less tests mock the tracker client to isolate handler logic. Gatherers are mocked globally; GitHub API calls are mocked via fetch stubs.

## Invariants

- 409 TRACKER_CONFLICT response shape must include: code, externalId, error, conflictedWith, refreshHint='reload-roadmap' — clients rely on this to detect and recover from concurrent mutations
- Only 'planned' features are claimable; attempting to claim 'in-progress' or 'done' returns 409; status must transition to 'in-progress' on successful claim
- Workflow routing is spec-driven: no spec → brainstorming; spec but no plan → planning; routing decision gates downstream orchestration
- Real filesystem required for file-based tests — roadmap.md store does async load→applyRoadmapDiff→serialize; static mocks cannot model this, tests must use actual temp files and verify on-disk persistence
- Cache invalidation is dual-key: both 'roadmap' and 'overview' cache entries must be invalidated on claim/refresh/status-update; partial invalidation leaves stale data
- GitHub sync is opt-in and non-blocking: syncing only occurs when externalId exists AND GITHUB_TOKEN env var is set; sync failures set githubSynced=false but don't fail the request
- Input validation is strict: missing feature or assignee returns 400; nonexistent feature returns 404; only one response sent per request
- Tracker client claim(id, assignee) contract: ConflictError raises 409; network/rate-limit errors raise 502; success returns mutated feature with new status/assignee

## Interface Contract

```ts

```

## Dependency Slice

```
import { DataCache } from '../../../src/server/cache'
import { ServerContext } from '../../../src/server/context'
import { GatherCache } from '../../../src/server/gather-cache'
import from '../../../src/server/gather/blast-radius'
import from '../../../src/server/gather/roadmap'
import from '../../../src/server/identity'
import { buildActionsRouter } from '../../../src/server/routes/actions'
import { handleClaimFileLess, handleRoadmapStatusFileLess } from '../../../src/server/routes/actions-claim-file-less'
import from '../../../src/server/routes/adoption'
import from '../../../src/server/routes/ci'
import from '../../../src/server/routes/graph'
import from '../../../src/server/routes/health'
import from '../../../src/server/routes/impact'
import from '../../../src/server/routes/overview'
import from '../../../src/server/routes/roadmap'
import from '../../../src/server/routes/signals'
import { buildSignoffRouter } from '../../../src/server/routes/signoff'
import { SSEManager } from '../../../src/server/sse'
import { AnomalyData, ArchData, PerfData, SecurityData } from '../../../src/shared/types'
import { ConflictError, FeaturePatch, HistoryEvent, NewFeatureInput, RoadmapTrackerClient, TrackedFeature, parseRoadmap } from '@harness-engineering/core'
import { GraphStore } from '@harness-engineering/graph'
import { SignalsResult } from '@harness-engineering/signals'
import { Err, Ok, Result } from '@harness-engineering/types'
import { Hono } from 'hono'
import * as fs from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as path, path, { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
