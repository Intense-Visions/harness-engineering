---
schemaVersion: 1
module: 'packages/core/src/roadmap/migrate'
sourceHash: '5d009971e6a190a8931cbcfb7a62d346a819ddf3ebb7efb2ba71488c396fe7c2'
compiledAt: '2026-08-28T01:22:10.518Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['body-diff.ts', 'history-hash.ts', 'index.ts', 'plan-builder.ts', 'run.ts', 'types.ts']
---

## Interface Contract

```ts
export MigrationOptions
export MigrationPlan
export MigrationReport
export RunDeps
export bodyMetaMatches
export buildHistoryCommentBody
export buildMigrationPlan
export hashHistoryEvent
export parseHashFromCommentBody
export runMigrationPlan
```

## Dependency Slice

```
import { FeaturePatch, HistoryEvent, HistoryEventType, NewFeatureInput, RoadmapTrackerClient, TrackedFeature } from '../tracker'
import { BodyMeta, parseBodyBlock } from '../tracker/body-metadata'
import { bodyMetaMatches } from './body-diff'
import { hashHistoryEvent } from './history-hash'
import { MigrationOptions, MigrationPlan, MigrationReport } from './types'
import { Ok, Result, Roadmap, RoadmapFeature, RoadmapMilestone } from '@harness-engineering/types'
import { createHash } from 'node:crypto'
import * as path from 'node:path'
```
