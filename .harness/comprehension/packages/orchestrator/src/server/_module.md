---
schemaVersion: 1
module: 'packages/orchestrator/src/server'
sourceHash: '493c06f719c9cff84611dd48da0a8800e467bcfb869976f4ca502edfb3e6a1fc'
compiledAt: '2026-08-28T01:22:12.354Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'dispatch-audit-status.test.ts',
    'http-v1-aliases.test.ts',
    'http.test.ts',
    'http.ts',
    'plan-watcher.ts',
    'scope-method-enforcement.test.ts',
    'static.ts',
    'utils.ts',
    'v1-bridge-routes.test.ts',
    'v1-bridge-routes.ts',
    'webhooks-integration.test.ts',
    'websocket.ts',
  ]
---

## Interface Contract

```ts
export DEPRECATION_DATE
export OrchestratorServer
export PlanWatcher
export V1_BRIDGE_ROUTES
export WebSocketBroadcaster
export getBindHost
export handleStaticFile
export isV1Bridge
export readBody
export requiredBridgeScope
```

## Dependency Slice

```
import { BackendRouter } from '../agent/backend-router'
import { AuditLogger } from '../auth/audit'
import { hasScope, requiredScopeForRoute } from '../auth/scopes'
import { TokenStore } from '../auth/tokens'
import { AnalysisArchive } from '../core/analysis-archive'
import { InteractionQueue, PendingInteraction } from '../core/interaction-queue'
import { StreamRecorder } from '../core/stream-recorder'
import { WebhookDelivery } from '../gateway/webhooks/delivery'
import { wireWebhookFanout } from '../gateway/webhooks/events'
import { WebhookQueue } from '../gateway/webhooks/queue'
import { WebhookStore } from '../gateway/webhooks/store'
import { MODEL_INSTALL_TOPIC, MODEL_POOL_TOPIC, MODEL_PROPOSAL_TOPIC, ModelPoolOps } from '../proposals/model-handlers'
import { RoutingDecisionBus } from '../routing/decision-bus'
import { OrchestratorServer } from './http'
import { PlanWatcher } from './plan-watcher'
import { handleAnalysesRoute } from './routes/analyses'
import { handleAnalyzeRoute } from './routes/analyze'
import { handleAuthRoute } from './routes/auth'
import { handleChatProxyRoute } from './routes/chat-proxy'
import { DispatchAdHocFn, handleDispatchActionsRoute } from './routes/dispatch-actions'
import { handleInteractionsRoute } from './routes/interactions'
import { GetLocalModelStatusFn, GetLocalModelStatusesFn, handleLocalModelRoute, handleLocalModelsRoute } from './routes/local-model'
import { MaintenanceRouteDeps, handleMaintenanceRoute } from './routes/maintenance'
import { handlePlansRoute } from './routes/plans'
import { handleRoadmapActionsRoute } from './routes/roadmap-actions'
import { handleSessionsRoute } from './routes/sessions'
import { handleStreamsRoute } from './routes/streams'
import { handleV1EventsSseRoute } from './routes/v1/events-sse'
import { handleV1InteractionsResolveRoute } from './routes/v1/interactions-resolve'
import { handleV1JobsMaintenanceRoute } from './routes/v1/jobs-maintenance'
import { RefreshSchedulerOps, handleV1LocalModelsRoute } from './routes/v1/local-models'
import { handleV1LocalModelsMutationRoute } from './routes/v1/local-models-pool-mutation'
import { handleV1ProposalsRoute } from './routes/v1/proposals'
import { handleV1RoutingRoute } from './routes/v1/routing'
import { handleV1TelemetryRoute } from './routes/v1/telemetry'
import { handleV1WebhooksRoute } from './routes/v1/webhooks'
import { handleStaticFile } from './static'
import { V1_BRIDGE_ROUTES, isV1Bridge, requiredBridgeScope } from './v1-bridge-routes'
import { WebSocketBroadcaster } from './websocket'
import { CacheMetricsRecorder, assertPortUsable } from '@harness-engineering/core'
import { IntelligencePipeline } from '@harness-engineering/intelligence'
import { HardwareProfile, RankedModel } from '@harness-engineering/local-models'
import { AuthToken, BackendDef, Proposal, RoutingConfig, RoutingDecision, RoutingPolicy, RoutingStatus, RoutingTelemetry, TokenScope } from '@harness-engineering/types'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { EventEmitter } from 'node:events'
import * as fs, { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import * as http, http, { HttpServer, IncomingMessage, ServerResponse } from 'node:http'
import * as net, { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { Duplex } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket, WebSocketServer } from 'ws'
```
