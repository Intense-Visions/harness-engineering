---
schemaVersion: 1
module: 'packages/core/src/roadmap/adapters'
sourceHash: '6817da6f7c184bac70dd98ef437ed3f9eb625265da6dfeb9a2d66dbac2897b68'
compiledAt: '2026-08-28T01:22:10.499Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['github-issues.ts']
---

## Interface Contract

```ts
export GitHubIssuesSyncAdapter
export buildExternalId
export parseExternalId
```

## Dependency Slice

```
import { pushAssigneeToExternal } from '../assignee-lifecycle'
import { buildExternalId, parseExternalId } from '../external-id'
import { TicketWriteOptions, TrackerSyncAdapter } from '../tracker-sync'
import { Err, ExternalTicket, ExternalTicketState, Ok, Result, RoadmapFeature, TrackerComment, TrackerSyncConfig } from '@harness-engineering/types'
```
