---
schemaVersion: 1
module: 'packages/dashboard/src/server/gather'
sourceHash: '3474b6fd37b169bf53417f30c1396937720b9933d818d3bef0351f5b9570e761'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
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
import { ArchBaselineManager, ArchConfigSchema, EntropyAnalyzer, EntropyConfig, SECURITY_SCAN_DEFAULT_IGNORE, SECURITY_SCAN_GLOB, SecurityScanner, TimelineManager, TrendResult, aggregateBySkill, diff, parseSecurityConfig, readAdoptionRecords, resolveRoadmapStore, runAll } from '@harness-engineering/core'
import { CascadeSimulator, GraphAnomalyAdapter, GraphStore, NODE_TYPES, queryTraceability } from '@harness-engineering/graph'
import { AdoptionSnapshot } from '@harness-engineering/types'
import { glob } from 'glob'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
```
