---
schemaVersion: 1
module: 'packages/core/src/roadmap/tracker'
sourceHash: '2d09ff6d2d3471ff1770d5072ba1068301e16e462ce4baeb9a457a920c81c5de'
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
    'registry.ts',
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
export PnyonTrackerAdapter
export PnyonTrackerClientConfig
export PnyonTrackerOptions
export RegisteredTrackerClientConfig
export RoadmapTrackerClient
export TrackedFeature
export TrackerClientConfig
export TrackerConfig
export TrackerConflictBody
export TrackerKindRegistration
export WaypointCommand
export WaypointCommandResult
export WaypointEvidenceEntry
export WaypointHttp
export WaypointHttpError
export WaypointItem
export WaypointItemPatch
export WaypointNewItem
export createTrackerClient
export getTrackerKindRegistration
export listRegisteredTrackerKinds
export makeTrackerConflictBody
export registerTrackerKind
export waypointItemUrl
```

## Dependency Slice

```
import { GitHubIssuesTrackerAdapter, GitHubIssuesTrackerOptions } from './adapters/github-issues'
import { LinearTrackerAdapter, LinearTrackerOptions } from './adapters/linear'
import { PnyonTrackerAdapter, PnyonTrackerClientConfig } from './adapters/pnyon'
import { ConflictError, FeaturePatch, RoadmapTrackerClient, TrackedFeature } from './client'
import { makeTrackerConflictBody } from './conflict-body'
import { ETagStore } from './etag-store'
import { getTrackerKindRegistration } from './registry'
import { Err, FeatureStatus, Ok, Priority, Result } from '@harness-engineering/types'
import { describe, expect, it } from 'vitest'
import { parseYaml, stringifyYaml } from 'yaml'
```
