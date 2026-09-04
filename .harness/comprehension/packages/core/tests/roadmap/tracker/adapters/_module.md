---
schemaVersion: 1
module: 'packages/core/tests/roadmap/tracker/adapters'
sourceHash: 'fb6d1db916f9ba394a15da9640baac680e0fddc5a1d9b9e6cc566a4b9ab29346'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'github-issues-conflict.test.ts',
    'github-issues-history.test.ts',
    'github-issues-state-guard.test.ts',
    'github-issues.e2e.test.ts',
    'github-issues.test.ts',
    'pnyon.test.ts',
    'waypoint-mock.ts',
  ]
---

## Interface Contract

```ts
export MockWaypointApi
```

## Dependency Slice

```
import { GitHubIssuesTrackerAdapter } from '../../../../src/roadmap/tracker/adapters/github-issues'
import { PnyonTrackerAdapter } from '../../../../src/roadmap/tracker/adapters/pnyon'
import { WaypointCommand, WaypointEvidenceEntry, WaypointItem, WaypointNewItem } from '../../../../src/roadmap/tracker/adapters/waypoint-http'
import { serializeBodyBlock } from '../../../../src/roadmap/tracker/body-metadata'
import { ConflictError, HistoryEvent } from '../../../../src/roadmap/tracker/client'
import { ETagStore } from '../../../../src/roadmap/tracker/etag-store'
import { MockWaypointApi } from './waypoint-mock'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
```
