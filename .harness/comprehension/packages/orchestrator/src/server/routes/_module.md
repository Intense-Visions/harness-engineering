---
schemaVersion: 1
module: "packages/orchestrator/src/server/routes"
sourceHash: "a346232ceb615c182971cd8fabf41a4ce782764c9e437867b672003328ac9057"
compiledAt: "2026-08-28T01:22:12.404Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["analyses.ts", "analyze.test.ts", "analyze.ts", "auth.test.ts", "auth.ts", "chat-proxy.ts", "dispatch-actions.test.ts", "dispatch-actions.ts", "interactions.ts", "local-model.ts", "maintenance.ts", "plans.ts", "roadmap-actions.ts", "sessions.ts", "streams.ts"]
---

## Summary

**`packages/orchestrator/src/server/routes`** is a collection of handler modules that implement the orchestrator's HTTP API surface. Each route module exports a `handleXRoute` function that claims or rejects requests by returning `true`/`false`, validates input via Zod schemas, and manages a specific concern (auth tokens, interactions, analyses, roadmap mutations, local models, etc.). Handlers run async work via fire-and-forget callbacks and always control the full response lifecycle.

The `OrchestratorServer` class chains these handlers in an ordered route table. Auth + scope gating runs at the server level. Handlers are closures that re-read mutable dependencies (`pipeline`, `recorder`, `maintenanceDeps`) on every request, so state mutations take effect immediately.

The routes handle: auth admin (token CRUD), intelligence pipeline (work-item analysis → SSE), interaction queue (status updates), roadmap mutations + tracker integration, session persistence, local model management (status/pool/proposals/refresh), plan/stream serving, webhooks, telemetry, and maintenance jobs.

## Invariants

- Route dispatch is first-match-wins in buildApiRoutes(); order matters. Adding a route is a one-place change in that array. Once a handler returns true, no other handlers see the request.
- Handlers always control full response lifecycle—once they claim a request, they must send headers+body or risk ERR_HTTP_HEADERS_SENT crashes. Fire-and-forget callbacks are safe; they never re-enter the same response object.
- Validation is mandatory before use: every handler parses input via Zod schema and rejects (400/422) on failure. Zod-validated input is marked with harness-ignore SEC-DES-001; unmarked JSON.parse() calls are bugs.
- Closure captures are the source of truth for mutable state (pipeline, recorder, maintenanceDeps). Handlers re-read them on every request. Lazy init (setPipeline()) or hot-swap (ingestRoutingPolicy()) is safe because closures always see the current value.
- Route dependencies must be null-checked: handlers short-circuit to 503 or return false when optional deps are absent. This allows tests to omit deps without crashing.
- Path traversal + ID validation is always explicit: session IDs, interaction IDs, token IDs validated via regex/basename checks (isSafeId(), SAFE_ID_RE, UUID_RE). Path separators and .. are rejected. Roadmap titles reject newlines+markdown headings.
- Auth + scope gating is a precondition: resolveAuth() runs before handleApiRoutes(). Handlers assume caller is authenticated+scope-checked; return 405 (not 404) on method mismatch to disambiguate.
- Error responses are lossy for security: internal errors (filesystem, bcrypt, external APIs) are masked with generic 500 messages. Only validation errors (400/422) expose details.

## Interface Contract

```ts
export MaintenanceHistoryEntry
export handleAnalysesRoute
export handleAnalyzeRoute
export handleAuthRoute
export handleChatProxyRoute
export handleDispatchActionsRoute
export handleInteractionsRoute
export handleLocalModelRoute
export handleLocalModelsRoute
export handleMaintenanceRoute
export handlePlansRoute
export handleRoadmapActionsRoute
export handleSessionsRoute
export handleStreamsRoute
export mapContentBlock
export toMaintenanceHistoryEntry
```

## Dependency Slice

```
import { TokenStore } from '../../auth/tokens'
import { AnalysisArchive } from '../../core/analysis-archive'
import { InteractionQueue } from '../../core/interaction-queue'
import { StreamRecorder } from '../../core/stream-recorder'
import { MaintenanceReporter } from '../../maintenance/reporter'
import { MaintenanceScheduler } from '../../maintenance/scheduler'
import { RunResult } from '../../maintenance/types'
import { OrchestratorServer } from '../http'
import { readBody } from '../utils'
import { readBody } from '../utils.js'
import { handleAnalyzeRoute } from './analyze'
import { handleDispatchActionsRoute } from './dispatch-actions'
import { ConflictError, NewFeatureInput, applyRoadmapDiff, createTrackerClient, loadProjectRoadmapMode, loadTrackerClientConfigFromProject, makeTrackerConflictBody, resolveRoadmapStoreForFile } from '@harness-engineering/core'
import { IntelligencePipeline, manualToRawWorkItem, scoreToConcernSignals } from '@harness-engineering/intelligence'
import { AuthTokenPublic, AuthTokenPublicSchema, BridgeKindSchema, Issue, LocalModelStatus, MaintenanceHistoryEntry, NamedLocalModelStatus, TokenScopeSchema } from '@harness-engineering/types'
import { ChildProcess, spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import * as fs from 'node:fs/promises'
import http, { IncomingMessage, ServerResponse } from 'node:http'
import { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import * as readline from 'node:readline'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
