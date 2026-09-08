---
schemaVersion: 1
module: 'packages/core/tests/roadmap/adapters'
sourceHash: 'a6e06642060647221185e60e5b6b6955a61a377d31ccbaf0c95d4cc41357fa67'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['pnyon-sync.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { PnyonSyncAdapter } from '../../../src/roadmap/adapters/pnyon-sync'
import { PnyonTrackerAdapter, waypointItemUrl } from '../../../src/roadmap/tracker/adapters/pnyon'
import { MockWaypointApi } from '../tracker/adapters/waypoint-mock'
import { RoadmapFeature } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
```
