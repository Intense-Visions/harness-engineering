---
schemaVersion: 1
module: 'packages/core/src/roadmap/tracker'
sourceHash: '840004abe2f01059b668b3eed40b1176e5935574f7b010003930a5c00665a93f'
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
