---
schemaVersion: 1
module: 'packages/dashboard/src/server'
sourceHash: '44937ef2e3716c42f80fb802aa309216facef921d3f04b7ae3cca6b7aedc0d5c'
compiledAt: '2026-08-28T01:22:11.363Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'cache.ts',
    'context.ts',
    'gather-cache.ts',
    'identity.ts',
    'index.ts',
    'orchestrator-proxy.ts',
    'serve.ts',
    'sse.ts',
  ]
---

## Interface Contract

```ts
export app
export buildApp
```

## Dependency Slice

```
import { API_PORT, DASHBOARD_PORT, DEFAULT_POLL_INTERVAL_MS, ORCHESTRATOR_PORT, getBindHost } from '../shared/constants'
import { DashboardRole, coerceRole } from '../shared/roles'
import { CacheEntry, ChecksData, OverviewData, ResolvedIdentity, SSEEvent } from '../shared/types'
import { DataCache } from './cache'
import { ServerContext, buildContext } from './context'
import { GatherCache } from './gather-cache'
import { gatherAnomalies } from './gather/anomalies'
import { gatherArch } from './gather/arch'
import { gatherGraph } from './gather/graph'
import { gatherHealth } from './gather/health'
import { gatherPerf } from './gather/perf'
import { gatherRoadmap } from './gather/roadmap'
import { gatherSecurity } from './gather/security'
import from './index'
import { attachWsProxy, getOrchestratorTarget, orchestratorProxyMiddleware } from './orchestrator-proxy'
import { buildActionsRouter } from './routes/actions'
import { buildAdoptionRouter } from './routes/adoption'
import { buildCIRouter } from './routes/ci'
import { buildDecayTrendsRouter } from './routes/decay-trends'
import { buildGraphRouter } from './routes/graph'
import { buildHealthRouter } from './routes/health'
import { buildHealthCheckRouter } from './routes/health-check'
import { buildImpactRouter } from './routes/impact'
import { buildOverviewRouter } from './routes/overview'
import { buildRoadmapRouter } from './routes/roadmap'
import { buildSignalsRouter } from './routes/signals'
import { buildSignoffRouter } from './routes/signoff'
import { buildSseRouter } from './routes/sse'
import { buildTraceabilityRouter } from './routes/traceability'
import { SSEContext, SSEManager } from './sse'
import { assertPortUsable, isBadPort, roadmapAggregatePath } from '@harness-engineering/core'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Context, Hono, Next } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { SSEStreamingApi } from 'hono/streaming'
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import http from 'node:http'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
```
