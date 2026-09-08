---
schemaVersion: 1
module: 'packages/core/src/roadmap/adapters'
sourceHash: '9a452b1d5ea8390c54a737e0e143c0eedc2087491807e9e154d3b0f1cf01a3f4'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['github-issues.ts', 'pnyon-sync.ts']
---

## Interface Contract

```ts
export GitHubIssuesSyncAdapter
export PnyonSyncAdapter
export buildExternalId
export githubRepoPath
export parseExternalId
```

## Dependency Slice

```
import { pushAssigneeToExternal } from '../assignee-lifecycle'
import { buildExternalId, githubRepoPath, parseExternalId } from '../external-id'
import { TicketWriteOptions, TrackerSyncAdapter } from '../tracker-sync'
import { PnyonTrackerAdapter, waypointItemUrl } from '../tracker/adapters/pnyon'
import { HistoryEvent } from '../tracker/client'
import { Err, ExternalTicket, ExternalTicketState, GitHubTrackerSyncConfig, Ok, Result, RoadmapFeature, TrackerComment } from '@harness-engineering/types'
```
