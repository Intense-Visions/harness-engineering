---
schemaVersion: 1
module: 'packages/orchestrator/src/tracker/adapters'
sourceHash: '607779f7f995259fdb845f125216ba8e94190ea09e8b2ba1352be2a9e391611e'
compiledAt: '2026-08-28T01:22:12.385Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['github-issues-issue-tracker.ts', 'roadmap.ts']
---

## Interface Contract

```ts
export GitHubIssuesIssueTrackerAdapter
export RoadmapTrackerAdapter
```

## Dependency Slice

```
import { BlockerRef, Issue, IssueTrackerClient, RoadmapTrackerClient, TrackedFeature, TrackerConfig, applyRoadmapDiff, claimFeature, isClaimableBy, resolveRoadmapStoreForFile, setFeatureStatus } from '@harness-engineering/core'
import { Err, FeatureStatus, Ok, Result, RoadmapFeature } from '@harness-engineering/types'
import { createHash } from 'node:crypto'
```
