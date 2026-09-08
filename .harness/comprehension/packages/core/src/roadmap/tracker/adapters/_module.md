---
schemaVersion: 1
module: 'packages/core/src/roadmap/tracker/adapters'
sourceHash: '328acb0e1525bb9d5403179a4681ae99566554c50b20b338a949ba31978b7700'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'github-http.test.ts',
    'github-http.ts',
    'github-issues.ts',
    'linear.test.ts',
    'linear.ts',
    'pnyon.ts',
    'waypoint-http.ts',
  ]
---

## Interface Contract

```ts
export GitHubHttp
export GitHubIssuesTrackerAdapter
export HistoryEventType
export LinearTrackerAdapter
export PnyonTrackerAdapter
export WaypointHttp
export WaypointHttpError
export buildExternalId
export githubRepoPath
export parseExternalId
export waypointItemUrl
```

## Dependency Slice

```
import { RateBudget, ThrottledFetchError, TruncatedFetchError, sharedRateBudget } from '../../../fleet/rate-budget'
import { BodyMeta, parseBodyBlock, serializeBodyBlock } from '../body-metadata'
import { ConflictError, ConflictErrorClass, FeaturePatch, HistoryEvent, HistoryEventType, NewFeatureInput, RoadmapTrackerClient, TrackedFeature } from '../client'
import { refetchAndCompare } from '../conflict'
import { ETagStore } from '../etag-store'
import from '../factory'
import { GitHubHttp, buildExternalId, githubRepoPath, parseExternalId } from './github-http'
import { LinearTrackerAdapter } from './linear'
import { WaypointCommand, WaypointHttp, WaypointHttpError, WaypointItem, WaypointItemPatch } from './waypoint-http'
import { Err, FeatureStatus, Ok, Priority, Result } from '@harness-engineering/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
