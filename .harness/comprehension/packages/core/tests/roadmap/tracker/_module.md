---
schemaVersion: 1
module: 'packages/core/tests/roadmap/tracker'
sourceHash: 'd9563716fbf392fab8e715586f56e0efa7335f1706f5d71887011b27a4f6af22'
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
    'registry.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { loadTrackerClientConfigFromProject } from '../../../src/roadmap/load-tracker-client-config'
import { GitHubIssuesTrackerAdapter } from '../../../src/roadmap/tracker/adapters/github-issues'
import { PnyonTrackerAdapter } from '../../../src/roadmap/tracker/adapters/pnyon'
import { BodyMeta, parseBodyBlock, serializeBodyBlock } from '../../../src/roadmap/tracker/body-metadata'
import { ConflictError, FeaturePatch, TrackedFeature } from '../../../src/roadmap/tracker/client'
import { refetchAndCompare, withBackoff } from '../../../src/roadmap/tracker/conflict'
import { ETagStore } from '../../../src/roadmap/tracker/etag-store'
import { createTrackerClient } from '../../../src/roadmap/tracker/factory'
import { getTrackerKindRegistration, listRegisteredTrackerKinds, registerTrackerKind } from '../../../src/roadmap/tracker/registry'
import { BlockerRef, ConflictError, FeaturePatch, HistoryEvent, Issue, IssueTrackerClient, NewFeatureInput, RoadmapTrackerClient, TrackedFeature, TrackerConfig, createTrackerClient } from '@harness-engineering/core'
import { Ok } from '@harness-engineering/types'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
```
