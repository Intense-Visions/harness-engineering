---
schemaVersion: 1
module: 'packages/core/tests/roadmap/migrate'
sourceHash: '64b4aa88149e7dfed98f53c6dd3f594903eab34d46865f60baa5c220d453238c'
compiledAt: '2026-08-28T01:22:10.915Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'body-diff.test.ts',
    'history-hash.test.ts',
    'plan-builder.test.ts',
    'run-idempotent.test.ts',
    'run-partial-failure.test.ts',
    'run.test.ts',
  ]
---

## Summary

The `packages/core/tests/roadmap/migrate` test suite validates the roadmap→issue-tracker migration pipeline, covering feature classification (create/update/unchanged/ambiguous), deterministic history hashing for idempotent comment deduplication, metadata normalization, and full round-trip execution. It ensures roadmap.md stays in sync with GitHub issues through External-ID linkage, collision detection, and append-only assignment history.

## Invariants

- External-ID is the authoritative feature identity; features without it and same-titled collisions are ambiguous and require manual resolution.
- History event hashes must be deterministic at second granularity with day-only dates canonicalized to midnight UTC and subsecond variance collapsed, enabling idempotent re-runs without duplicating comments.
- Metadata equivalence: null and missing fields are treated identically, and blocked_by arrays are order-insensitive to prevent spurious updates on re-runs.
- History appending is append-only and dedup'd by hash; only unhashed events from assignment records are appended as issue comments.
- A feature without External-ID and no same-title collision is immediately create-bound; with collision it enters ambiguous state for human triage.

## Interface Contract

```ts

```

## Dependency Slice

```
import { bodyMetaMatches } from '../../../src/roadmap/migrate/body-diff'
import { hashHistoryEvent, parseHashFromCommentBody } from '../../../src/roadmap/migrate/history-hash'
import { buildMigrationPlan } from '../../../src/roadmap/migrate/plan-builder'
import { RunDeps, runMigrationPlan } from '../../../src/roadmap/migrate/run'
import { MigrationPlan } from '../../../src/roadmap/migrate/types'
import { FeaturePatch, HistoryEvent, NewFeatureInput, RoadmapTrackerClient, TrackedFeature } from '../../../src/roadmap/tracker'
import { serializeBodyBlock } from '../../../src/roadmap/tracker/body-metadata'
import { AssignmentRecord, Err, Ok, Roadmap, RoadmapFeature, RoadmapFrontmatter, RoadmapMilestone } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { describe, expect, it } from 'vitest'
```
