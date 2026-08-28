---
schemaVersion: 1
module: 'packages/core/src/state/event-sourcing/projections'
sourceHash: 'baffa1f028310afaae6464cb8f9989deb7fd9c8bbbaf7dcc4042cd548b4feed4'
compiledAt: '2026-08-28T01:22:10.607Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['audit.ts', 'core-state.ts', 'lanes.ts']
---

## Interface Contract

```ts
export formatAuditTimeline
export projectAudit
export projectCoreState
export projectLanes
export toHarnessState
```

## Dependency Slice

```
import { HarnessState, HarnessStateSchema } from '../../types'
import { Event, Lane } from '../events'
```
