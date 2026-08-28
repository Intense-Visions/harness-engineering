---
schemaVersion: 1
module: 'packages/core/tests/roadmap/tracker'
sourceHash: 'cbd88a69607acd27eeab83e4e60e8a9b7a2564642854e7eb5cfbc3be4478dcc0'
compiledAt: '2026-08-28T01:22:10.948Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'body-metadata.test.ts',
    'conflict.test.ts',
    'etag-store.test.ts',
    'factory.test.ts',
    'index.test.ts',
    'public-surface.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { GitHubIssuesTrackerAdapter } from '../../../src/roadmap/tracker/adapters/github-issues'
import { BodyMeta, parseBodyBlock, serializeBodyBlock } from '../../../src/roadmap/tracker/body-metadata'
import { ConflictError, FeaturePatch, TrackedFeature } from '../../../src/roadmap/tracker/client'
import { refetchAndCompare, withBackoff } from '../../../src/roadmap/tracker/conflict'
import { ETagStore } from '../../../src/roadmap/tracker/etag-store'
import { createTrackerClient } from '../../../src/roadmap/tracker/factory'
import { BlockerRef, ConflictError, FeaturePatch, HistoryEvent, Issue, IssueTrackerClient, NewFeatureInput, RoadmapTrackerClient, TrackedFeature, TrackerConfig, createTrackerClient } from '@harness-engineering/core'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
```
