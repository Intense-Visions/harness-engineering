---
schemaVersion: 1
module: 'packages/core/src/roadmap/tracker/adapters'
sourceHash: 'c3390051d8aae8af9eddfb6a65168f331efcd42a2d89467b7d09a43695fd85c2'
compiledAt: '2026-08-28T01:22:10.544Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  ['github-http.test.ts', 'github-http.ts', 'github-issues.ts', 'linear.test.ts', 'linear.ts']
---

## Interface Contract

```ts
export GitHubHttp
export GitHubIssuesTrackerAdapter
export HistoryEventType
export LinearTrackerAdapter
export buildExternalId
export parseExternalId
```

## Dependency Slice

```
import { RateBudget, ThrottledFetchError, TruncatedFetchError, sharedRateBudget } from '../../../fleet/rate-budget'
import { BodyMeta, parseBodyBlock, serializeBodyBlock } from '../body-metadata'
import { ConflictError, ConflictErrorClass, FeaturePatch, HistoryEvent, HistoryEventType, NewFeatureInput, RoadmapTrackerClient, TrackedFeature } from '../client'
import { refetchAndCompare } from '../conflict'
import { ETagStore } from '../etag-store'
import from '../factory'
import { GitHubHttp, buildExternalId, parseExternalId } from './github-http'
import { LinearTrackerAdapter } from './linear'
import { Err, FeatureStatus, Ok, Priority, Result } from '@harness-engineering/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
```
