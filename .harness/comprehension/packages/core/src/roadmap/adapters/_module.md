---
schemaVersion: 1
module: 'packages/core/src/roadmap/adapters'
sourceHash: 'fa824d10207be552dc1ac588f44ce806d5cc7a432dc6d1972ea5568dae7a669f'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['github-issues.ts']
---

## Interface Contract

```ts
export GitHubIssuesSyncAdapter
export buildExternalId
export githubRepoPath
export parseExternalId
```

## Dependency Slice

```
import { pushAssigneeToExternal } from '../assignee-lifecycle'
import { buildExternalId, githubRepoPath, parseExternalId } from '../external-id'
import { TicketWriteOptions, TrackerSyncAdapter } from '../tracker-sync'
import { Err, ExternalTicket, ExternalTicketState, Ok, Result, RoadmapFeature, TrackerComment, TrackerSyncConfig } from '@harness-engineering/types'
```
