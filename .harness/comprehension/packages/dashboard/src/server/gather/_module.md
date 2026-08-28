---
schemaVersion: 1
module: 'packages/dashboard/src/server/gather'
sourceHash: '811ad8b7cf46587ea3b7a9220609bedc5430e7bdcdd19c7a01ad63840bafb6be'
compiledAt: '2026-08-28T01:22:11.398Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
members:
  [
    'adoption.ts',
    'anomalies.ts',
    'arch.ts',
    'blast-radius.ts',
    'ci.ts',
    'decay-trends.ts',
    'entry-points.ts',
    'graph.ts',
    'health.ts',
    'index.ts',
    'perf.ts',
    'roadmap.ts',
    'security.ts',
    'signoff.ts',
    'traceability.ts',
  ]
---

## Summary

The `packages/dashboard/src/server/gather` module is a unified data-aggregation facade that orchestrates domain-specific health checks (adoption, anomalies, architecture, CI status, graph metrics, entropy analysis) into a common result format for the dashboard. Each gatherer scans a different dimension of codebase health—skill usage, dependency coupling, security violations, performance regressions, entropy—and returns structured results or error objects. gatherCI is purely synchronous and cache-backed for fast page loads; all others perform I/O. Graph-dependent operations degrade gracefully when graph data is unavailable. Architecture checks use baseline comparison for regression detection; absent a baseline, the check passes in threshold-only mode.

## Invariants

- gatherCI must remain synchronous and cache-only — it is the thin read-path for dashboard page loads; running any gatherer inside it would block page rendering.
- Type guards at the CI mapping boundary (isArchData, isPerfData, isSecurityData) are the contract; if a cached result fails its type guard, map it to an error CheckResult without assumptions about its shape.
- Graph is optional — gatherAnomalies, gatherBlastRadius, and gatherGraph must return { available: false, reason: '...' } when graph data is missing, never throw.
- Query-scoped vs. summary-scoped — gatherBlastRadius(nodeId) is only safe to call with an explicit node ID; other gatherers are summary-scoped and run once per dashboard load.
- Arch baseline is load-bearing for regression detection — without a baseline, gatherArch returns { passed: true, totalViolations: 0, regressions: [] }; the baseline is the only mechanism to detect regressions.
- Entry-point discovery must handle missing packages/ — the monorepo root may not have a packages directory; discoverEntryPoints returns [] on ENOENT, never throws.

## Interface Contract

```ts
export SignalsResult
export gatherAdoption
export gatherAnomalies
export gatherArch
export gatherBlastRadius
export gatherCI
export gatherGraph
export gatherHealth
export gatherPerf
export gatherRoadmap
export gatherSecurity
export gatherSignals
```

## Dependency Slice

```
import { GRAPH_DIR } from '../../shared/constants'
import { isArchData, isPerfData, isSecurityData } from '../../shared/typeGuards'
import { AnomalyResult, ArchResult, BlastRadiusResult, CIData, CheckResult, DashboardAssignmentRecord, DashboardFeature, FeatureStatus, GraphResult, HealthResult, MilestoneProgress, NodeTypeCount, PerfResult, PerfViolationSummary, RoadmapResult, SecurityResult, SignoffBasis, SignoffBasisSection, SignoffDecision, SignoffItem, SignoffRecord } from '../../shared/types'
import { GatherCache } from '../gather-cache'
import { discoverEntryPoints } from './entry-points'
import { ArchBaselineManager, ArchConfigSchema, EntropyAnalyzer, EntropyConfig, SECURITY_SCAN_DEFAULT_IGNORE, SECURITY_SCAN_GLOB, SecurityScanner, TimelineManager, TrendResult, aggregateBySkill, diff, readAdoptionRecords, resolveRoadmapStore, runAll } from '@harness-engineering/core'
import { CascadeSimulator, GraphAnomalyAdapter, GraphStore, NODE_TYPES, queryTraceability } from '@harness-engineering/graph'
import { AdoptionSnapshot } from '@harness-engineering/types'
import { glob } from 'glob'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
```
