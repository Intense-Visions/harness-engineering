---
schemaVersion: 1
module: "packages/orchestrator/tests/server"
sourceHash: "677068673514c6cebafdd627c1e6b401df53607a4354219fe42015a6d65363e3"
compiledAt: "2026-08-28T01:22:12.695Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["bind-host.test.ts", "http.test.ts", "integration.test.ts", "lmlm-phase7-e2e.test.ts", "local-model-broadcast.test.ts", "plan-watcher.test.ts", "static.test.ts", "websocket.test.ts"]
---

## Summary

This module tests the HTTP server surface of the orchestrator—the bridge between agents and external clients (UIs, webhooks, model managers). It covers three layers: host binding configuration, the main REST/WebSocket API, and integration with the Local Models (LMLM) proposal pipeline. The core responsibility is request routing + event broadcasting: the server exposes `/api/v1/state` (orchestrator snapshot), WebSocket `/ws` (real-time state/agent events/interactions), and proposal approval endpoints. A secondary responsibility (Phases 6–7) is LMLM gating: when a model pool is available, approval requests install models asynchronously (202 Accepted); when disabled, they return 501. The routing layer must ensure LMLM GET/POST routes never fall through to legacy handlers.

## Invariants

- getBindHost defaults to 127.0.0.1 when HOST env var is unset — server startup fails silently if this logic inverts; deployments rely on this for localhost-only safety.
- GET /api/v1/state must call orchestrator.getSnapshot() — client state synchronization depends on the call; mocking this returns stale data.
- WebSocket messages must include type and data fields — client parsers hardcode this shape; malformed broadcasts break all subscribers.
- Model proposal approval returns 202 Accepted when getModelPool() is available, 501 Not Implemented when absent — this is the LMLM feature gate; clients use status code to detect availability.
- LMLM routes (both GET + POST) must route through V1_BRIDGE_ROUTES → handleV1LocalModelsRoute, NOT fall through to the legacy /api/local-models handler — dual routing breaks the PoolState contract and violates Phase 7 invariant.
- POST /api/v1/local-models/refresh returns { emitted: number } when scheduler exists, { error: '...LMLM disabled...' } + 503 when absent — monitoring dashboards count the emitted field; absent responses must be distinguishable.
- Host/port must persist across multiple server instances in tests — afterEach cleanup via server.stop() and the 50ms grace period prevents port collision in retry-flaky tests.

## Interface Contract

```ts

```

## Dependency Slice

```
import { InteractionQueue } from '../../src/core/interaction-queue'
import { wireNotificationSinks } from '../../src/notifications/events'
import { SinkRegistry } from '../../src/notifications/registry'
import { ModelHandlerDeps, ModelPoolOps, onApproveModelProposal } from '../../src/proposals/model-handlers'
import { OrchestratorServer, getBindHost } from '../../src/server/http'
import { PlanWatcher } from '../../src/server/plan-watcher'
import { handleStaticFile } from '../../src/server/static'
import { WebSocketBroadcaster } from '../../src/server/websocket'
import { EvictRequest, InstallAdapter, InstallRequest, InstallResult, PoolEntry, PoolFilesystem, PoolManager, PoolState, PoolStateStore, TickResult } from '@harness-engineering/local-models'
import { LocalModelStatus, ModelProposalRecord, NamedLocalModelStatus, NotificationsConfig, Proposal } from '@harness-engineering/types'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import * as fs from 'node:fs/promises'
import * as http from 'node:http'
import * as os from 'node:os'
import * as path from 'node:path'
import { TestOptions, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
```
