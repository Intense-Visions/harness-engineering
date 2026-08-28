---
schemaVersion: 1
module: 'packages/dashboard/src/server/routes'
sourceHash: 'f1d0d3bbe2025f950e60a8107f05073fe43b1bdb1fc8bb3217f9aa5987ef796c'
compiledAt: '2026-08-28T01:22:11.403Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The routes module implements the dashboard server's HTTP endpoint layer via 16 router builders and 2 file-less handlers. Each builder returns a Hono router configured with endpoints split into three categories: data gathering (cache-backed GET endpoints for metrics), mutations (POST endpoints for claim/status/validate with serialized file writes), and signoff (human acceptance recording). The module supports both file-backed and file-less roadmap modes, dispatching at runtime on project config. All file writes serialize via `withFileLock` to prevent concurrent corruption. Status values are closed to 6 options and validated at both code paths. Assignee-status coupling is enforced via `setStatus()` to preserve the invariant that assignee ≠ null ⟺ status = 'in-progress'.

## Invariants

- Assignee-status coupling (RMH005): assignee !== null ⟺ status = 'in-progress'; all transitions route through setStatus() to auto-clear stale assignees
- Roadmap aggregate immutability (R): never read/write aggregate directly; all mutations via applyRoadmapDiff(store, before, after) which regenerates from shards or rewrites whole file
- Serialized file writes: all writes to projectPath/chartsPath must acquire withFileLock() first; concurrent mutations queue and serialize fully
- Single validation gate: only one pnpm harness validate process at a time; validating flag returns 429 during concurrent attempts
- Closed status set: exactly 6 valid statuses (done, in-progress, planned, blocked, backlog, needs-human); validation at both file-less and file-backed paths rejects unknowns at 400
- Conflict error standardization (D-P4-B): file-less mode surfaces ConflictError as 409 with { error, code: 'TRACKER_CONFLICT', externalId, refreshHint }
- GitHub sync timing: assignment persisted to roadmap BEFORE attempting GitHub issue sync; network failure does not lose local change
- Validation output bounds: stdout/stderr each capped at 512 KB with truncation marker; process kills after 30 seconds; timeout returns dedicated error
- Cache invalidation scope: roadmap status changes invalidate 'roadmap' + 'overview'; regen-charts also invalidates 'health' + 'graph'; partial invalidation risks stale aggregates
- Dual roadmap mode dispatch: loadProjectRoadmapMode() determines file-less vs file-backed path at runtime; both must handle identical semantics

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
