---
schemaVersion: 1
module: 'packages/dashboard/src/server'
sourceHash: '44937ef2e3716c42f80fb802aa309216facef921d3f04b7ae3cca6b7aedc0d5c'
compiledAt: '2026-08-28T01:22:11.363Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: 'claude-haiku-4-5-20251001'
semantic: present
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

## Summary

The dashboard server module is a Hono-based HTTP server that serves the dashboard client, exposes 13+ API routes for workspace insights (overview, roadmap, health, graph, security, perf, arch, etc.), and manages SSE polling to push live telemetry to browsers. It uses two-tier caching (DataCache for short-lived endpoints, GatherCache for expensive operations run once per startup), proxies orchestrator traffic (HTTP + WebSocket), and resolves user identity via a GitHub API waterfall. Routes are built from a shared ServerContext dependency container; the SSE loop lazily evaluates expensive gatherers once, then replays cached results to all clients.

## Invariants

- Lazy expensive-gatherer evaluation: security/perf/arch/anomalies only run on first SSE tick; subsequent ticks replay cached results to all clients (including late-connects).
- Orchestrator proxy middleware must register before API routes so /api/v1/_, /api/state/_, /ws forward to orchestrator rather than returning 404.
- Roadmap path duality (invariant R): roadmapPath is display/watch/lock-key only; roadmap content is read/written via resolveRoadmapStore(), not the display path.
- Single writer to tokens.json: dashboard does NOT expose token CRUD; orchestrator is the sole writer to avoid unauthenticated-CRUD findings.
- Role preference (HARNESS_DASHBOARD_ROLE) is presentation-only for UI lane selection, not a security boundary; real per-role enforcement deferred to orchestrator proxy seam.
- CORS allow-list dynamically includes localhost + bind host; client port configurable via env.
- SSEManager lifecycle: polling loop starts on first connection, stops when last disconnects; timer and results shared across all connected clients.
- Identity cache uses single shared promise: concurrent resolveIdentity() calls don't spawn redundant GitHub API/CLI calls.
- Bad port validation: dashboard pre-validates bind port and orchestrator proxy port against WHATWG bad-ports list; 502 errors surface root cause for diagnostics.
- Route factory pattern: all route builders accept ServerContext, check DataCache, gather on miss, return Hono routers; no cross-route state.

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
