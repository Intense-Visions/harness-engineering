---
schemaVersion: 1
module: 'packages/orchestrator/tests/tracker/adapters'
sourceHash: '66007d0481fcf24d87511b8cabaf75f4709398e09b23f0d52dd9e744a98a0819'
compiledAt: '2026-08-28T01:22:12.738Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['github-issues-issue-tracker.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { GitHubIssuesIssueTrackerAdapter } from '../../../src/tracker/adapters/github-issues-issue-tracker'
import { ConflictError, FeaturePatch, HistoryEvent, NewFeatureInput, RoadmapTrackerClient, TrackedFeature, TrackerConfig } from '@harness-engineering/core'
import { Err, FeatureStatus, Ok, Result } from '@harness-engineering/types'
import { describe, expect, it, vi } from 'vitest'
```
