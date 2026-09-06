---
schemaVersion: 1
module: 'packages/dashboard/tests/server/routes'
sourceHash: 'a0a5b05234b3d396d762407973061497c31d860c871d653ccccd4d777e7140c8'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'actions-claim.external-id-path.test.ts',
    'actions-claim.file-less.test.ts',
    'actions-claim.test.ts',
    'actions-refresh.test.ts',
    'actions-roadmap-status.file-less.test.ts',
    'actions-roadmap-status.test.ts',
    'actions.file-less-stub.test.ts',
    'actions.roadmap-status.file-less-stub.test.ts',
    'adoption.test.ts',
    'ci.test.ts',
    'graph.test.ts',
    'health-extended.test.ts',
    'health.test.ts',
    'impact.test.ts',
    'overview.test.ts',
    'roadmap.test.ts',
    'signals.test.ts',
    'signoff.test.ts',
  ]
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { DataCache } from '../../../src/server/cache'
import { ServerContext } from '../../../src/server/context'
import { GatherCache } from '../../../src/server/gather-cache'
import from '../../../src/server/gather/blast-radius'
import from '../../../src/server/gather/roadmap'
import from '../../../src/server/identity'
import { buildActionsRouter } from '../../../src/server/routes/actions'
import { handleClaimFileLess, handleRoadmapStatusFileLess } from '../../../src/server/routes/actions-claim-file-less'
import from '../../../src/server/routes/adoption'
import from '../../../src/server/routes/ci'
import from '../../../src/server/routes/graph'
import from '../../../src/server/routes/health'
import from '../../../src/server/routes/impact'
import from '../../../src/server/routes/overview'
import from '../../../src/server/routes/roadmap'
import from '../../../src/server/routes/signals'
import { buildSignoffRouter } from '../../../src/server/routes/signoff'
import { SSEManager } from '../../../src/server/sse'
import { AnomalyData, ArchData, PerfData, SecurityData } from '../../../src/shared/types'
import { ConflictError, FeaturePatch, HistoryEvent, NewFeatureInput, RoadmapTrackerClient, TrackedFeature, parseRoadmap } from '@harness-engineering/core'
import { GraphStore } from '@harness-engineering/graph'
import { SignalsResult } from '@harness-engineering/signals'
import { Err, Ok, Result } from '@harness-engineering/types'
import { Hono } from 'hono'
import * as fs from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import * as os, { tmpdir } from 'node:os'
import * as path, path, { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
