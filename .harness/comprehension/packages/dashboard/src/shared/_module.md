---
schemaVersion: 1
module: 'packages/dashboard/src/shared'
sourceHash: 'a449dc1ef74c9d8bc2b40e9d73a0d6c3b33488dc613afb1c9110a0e6e7c62c8b'
compiledAt: '2026-08-28T01:22:11.374Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members: ['constants.ts', 'roles.ts', 'typeGuards.ts', 'types.ts']
---

## Interface Contract

```ts
export API_PORT
export API_PREFIX
export AdoptionSnapshot
export CONFLICT_TOAST_TEMPLATE
export DASHBOARD_PORT
export DASHBOARD_ROLES
export DEFAULT_POLL_INTERVAL_MS
export DEFAULT_ROLE
export FeatureStatus
export GRAPH_DIR
export ORCHESTRATOR_PORT
export SSE_ENDPOINT
export SkillAdoptionSummary
export coerceRole
export getBindHost
export isAnomalyData
export isArchData
export isBlastRadiusData
export isDashboardRole
export isGraphData
export isHealthData
export isPerfData
export isRoadmapData
export isSecurityData
export isTrackerConflictBody
```

## Dependency Slice

```
import { DashboardRole } from './roles'
import { AnomalyData, ArchData, BlastRadiusData, GraphData, HealthData, PerfData, RoadmapData, SecurityData } from './types'
import { FeatureStatus } from '@harness-engineering/core'
import { AdoptionSnapshot, SkillAdoptionSummary } from '@harness-engineering/types'
```
