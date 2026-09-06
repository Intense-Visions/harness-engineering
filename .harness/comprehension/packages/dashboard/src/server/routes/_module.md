---
schemaVersion: 1
module: 'packages/dashboard/src/server/routes'
sourceHash: '8f244303158a17fbac46ddf1f7b6bee5676a048184ce13a2081c8209d5476daf'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'actions-claim-file-less.ts',
    'actions.ts',
    'adoption.ts',
    'ci.ts',
    'decay-trends.ts',
    'graph.ts',
    'health-check.ts',
    'health.ts',
    'impact.ts',
    'overview.ts',
    'roadmap.ts',
    'signals.ts',
    'signoff.ts',
    'sse.ts',
    'traceability.ts',
  ]
---

## Interface Contract

```ts
export buildActionsRouter
export buildAdoptionRouter
export buildCIRouter
export buildDecayTrendsRouter
export buildGraphRouter
export buildHealthCheckRouter
export buildHealthRouter
export buildImpactRouter
export buildOverviewRouter
export buildRoadmapRouter
export buildSignalsRouter
export buildSignoffRouter
export buildSseRouter
export buildTraceabilityRouter
export handleClaimFileLess
export handleRoadmapStatusFileLess
```

## Dependency Slice

```
import { isAnomalyData } from '../../shared/typeGuards'
import { AnomalyData, AnomalyResult, ApiErrorResponse, ApiResponse, ArchResult, BlastRadiusResult, BlockerEdge, CIData, ChecksData, ClaimRequest, ClaimResponse, ExtendedHealthData, GraphResult, HealthCheckResponse, HealthResult, OverviewData, PerfResult, RoadmapChartsData, RoadmapData, RoadmapResult, SSEEvent, SecurityResult, SignoffBasis, SignoffDecision, SignoffItem, SignoffItemDisposition, SignoffRequest, SignoffResponse } from '../../shared/types'
import { ServerContext } from '../context'
import { gatherAdoption } from '../gather/adoption'
import { gatherAnomalies } from '../gather/anomalies'
import { gatherArch } from '../gather/arch'
import { gatherBlastRadius } from '../gather/blast-radius'
import { gatherCI } from '../gather/ci'
import { gatherDecayTrends } from '../gather/decay-trends'
import { gatherGraph } from '../gather/graph'
import { gatherHealth } from '../gather/health'
import { gatherPerf } from '../gather/perf'
import { gatherRoadmap } from '../gather/roadmap'
import { gatherSecurity } from '../gather/security'
import { gatherSignoffBasis, renderSignoffMarkdown, writeSignoffMarkdown } from '../gather/signoff'
import { TraceabilitySnapshot, gatherTraceability } from '../gather/traceability'
import { resolveIdentity, resolveRole } from '../identity'
import { handleClaimFileLess, handleRoadmapStatusFileLess } from './actions-claim-file-less'
import { ConflictError, FeaturePatch, RoadmapTrackerClient, TrackedFeature, TrendResult, applyRoadmapDiff, createTrackerClient, loadProjectRoadmapMode, loadTrackerClientConfigFromProject, makeTrackerConflictBody, resolveRoadmapStore, setStatus } from '@harness-engineering/core'
import { GraphStore, resolveGraphDir } from '@harness-engineering/graph'
import { UatSignoffRecorder } from '@harness-engineering/intelligence'
import { SignalsResult, gatherSignals } from '@harness-engineering/signals'
import { AdoptionSnapshot, FeatureStatus, Roadmap, RoadmapFeature } from '@harness-engineering/types'
import { Context, Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
```
