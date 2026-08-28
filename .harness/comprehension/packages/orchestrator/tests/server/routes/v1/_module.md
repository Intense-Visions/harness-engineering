---
schemaVersion: 1
module: "packages/orchestrator/tests/server/routes/v1"
sourceHash: "1f38cc9019bae1801a14e94cc196a1a95e0039399e2df979dc8dd6913a56f8a2"
compiledAt: "2026-08-28T01:22:12.725Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["local-models-pool-mutation.test.ts", "local-models.test.ts"]
---

## Summary

**packages/orchestrator/tests/server/routes/v1** tests the local-models HTTP API layer: two suites covering pool mutations (install async with 202+streaming, remove with in-use deference) and state reads (hardware profile, pool snapshot/view, ranked recommendations, proposals). Emphasizes fire-and-forget patterns, EventEmitter-based async completion signaling, pre-pull estimation to avoid 404s, and graceful degradation when LMLM is disabled. All endpoints validate auth scope and handle soft/hard failures distinctly.

## Invariants

- Fire-and-forget install: POST /pool/install returns 202 immediately without awaiting ollama pull (prevents proxy headersTimeout)
- Async completion streams: progress/completion frames ride EventEmitter (MODEL_INSTALL_TOPIC), not response body
- Ranked score propagation: seeds pool.install with recommendation score as initialScore; persists in auto-approved proposal for audit
- Pre-pull never inspects: routes pass estimated sizeOnDiskGb to pool; never trigger ollama /api/show on unpulled models (prevents 404)
- Pool vetoes deferred: budget_exceeded/not_allowed surface as error frames on WS topic after 202, not in response
- In-use removal defers: POST /pool/remove on in-use model marks pending eviction (202 deferred) vs immediate eviction
- Disabled LMLM returns 503: all routes gracefully return 503 when pool/scheduler/accessor is null (no 404 confusion)
- Soft vs hard refresh: HF unreachable + snapshot loaded = 200; HF unreachable + no snapshot = 503
- Disabled-first validation: when LMLM disabled, return 503 before validating query params (no info leakage)
- Mutation auth scoped: install/remove/candidates-refresh require 'manage-proposals' scope (registered in V1_BRIDGE_ROUTES)
- Recommendations constrained: top ∈ [1, 100] default 10; profile from allowed enum (default 'general'); validated after disabled check
- Pool state duality: routes expose viewState() for UI (includes pendingEviction flags); fallback to snapshot() (static state)

## Interface Contract

```ts

```

## Dependency Slice

```
import { requiredScopeForRoute } from '../../../../src/auth/scopes'
import { MODEL_INSTALL_TOPIC } from '../../../../src/proposals/model-handlers'
import { RefreshSchedulerOps, V1LocalModelsDeps, handleV1LocalModelsRoute } from '../../../../src/server/routes/v1/local-models'
import { V1LocalModelsMutationDeps, handleV1LocalModelsMutationRoute } from '../../../../src/server/routes/v1/local-models-pool-mutation'
import { V1_BRIDGE_ROUTES } from '../../../../src/server/v1-bridge-routes'
import { listProposals } from '@harness-engineering/core'
import { EmptyPoolState, EvictPoolRequest, EvictPoolResult, HardwareProfile, InstallPoolRequest, InstallPoolResult, PoolEntry, PoolState, PoolStateView, RankedModel, TickResult } from '@harness-engineering/local-models'
import { ModelInstallEvent, Proposal } from '@harness-engineering/types'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import * as os from 'node:os'
import * as path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
```
