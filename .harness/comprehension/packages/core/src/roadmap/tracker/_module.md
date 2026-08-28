---
schemaVersion: 1
module: 'packages/core/src/roadmap/tracker'
sourceHash: '0df5979eed831cd8f8caa37980c6b83336bb620e7c9a6646d9b5da3fb0699f1a'
compiledAt: '2026-08-28T01:22:10.551Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'body-metadata.ts',
    'client.ts',
    'conflict-body.test.ts',
    'conflict-body.ts',
    'conflict.ts',
    'etag-store.ts',
    'factory.ts',
    'index.ts',
    'types.ts',
  ]
---

## Interface Contract

```ts
export BlockerRef
export ConflictError
export ETagStore
export FeaturePatch
export GitHubTrackerClientConfig
export HistoryEvent
export HistoryEventType
export Issue
export IssueTrackerClient
export LinearTrackerAdapter
export LinearTrackerClientConfig
export LinearTrackerOptions
export MakeTrackerConflictBodyOptions
export NewFeatureInput
export RoadmapTrackerClient
export TrackedFeature
export TrackerClientConfig
export TrackerConfig
export TrackerConflictBody
export createTrackerClient
export makeTrackerConflictBody
```

## Dependency Slice

```
import { GitHubIssuesTrackerAdapter, GitHubIssuesTrackerOptions } from './adapters/github-issues'
import { LinearTrackerAdapter, LinearTrackerOptions } from './adapters/linear'
import { ConflictError, FeaturePatch, RoadmapTrackerClient, TrackedFeature } from './client'
import { makeTrackerConflictBody } from './conflict-body'
import { ETagStore } from './etag-store'
import { Err, FeatureStatus, Ok, Priority, Result } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
import { parseYaml, stringifyYaml } from 'yaml'
```
