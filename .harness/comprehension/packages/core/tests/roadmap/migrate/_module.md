---
schemaVersion: 1
module: 'packages/core/tests/roadmap/migrate'
sourceHash: '64b4aa88149e7dfed98f53c6dd3f594903eab34d46865f60baa5c220d453238c'
compiledAt: '2026-08-28T01:22:10.915Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
