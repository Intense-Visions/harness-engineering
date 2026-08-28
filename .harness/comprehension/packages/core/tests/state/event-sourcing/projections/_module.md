---
schemaVersion: 1
module: 'packages/core/tests/state/event-sourcing/projections'
sourceHash: '770b87ee5eb49f309354647e84600d088e645c739b3f379e0016758010e3c9e0'
compiledAt: '2026-08-28T01:22:11.066Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['audit.test.ts', 'core-state.test.ts', 'lanes.test.ts']
---

## Interface Contract

```ts

```

## Dependency Slice

```
import { Event } from '../../../../src/state/event-sourcing/events'
import { formatAuditTimeline, projectAudit } from '../../../../src/state/event-sourcing/projections/audit'
import { projectCoreState, toHarnessState } from '../../../../src/state/event-sourcing/projections/core-state'
import { projectLanes } from '../../../../src/state/event-sourcing/projections/lanes'
import { HarnessStateSchema } from '../../../../src/state/types'
import { describe, expect, it } from 'vitest'
```
