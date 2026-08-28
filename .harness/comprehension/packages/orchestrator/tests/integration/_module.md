---
schemaVersion: 1
module: "packages/orchestrator/tests/integration"
sourceHash: "4d539a2c01228b5df2eb1c653cd5d572826bcc2befcaf655722d4c3dfcdc0472"
compiledAt: "2026-08-28T01:22:12.626Z"
compiler: { static: "1.0.0", semantic: "1.0.0" }
model: "claude-haiku-4-5-20251001"
semantic: present
members: ["amr-routing-endpoints-e2e.test.ts", "claim-coordination.test.ts", "file-backed-coordination.test.ts", "intelligence-pipeline-routing.test.ts", "orchestrator-local-resolver.test.ts", "orchestrator-model-pool.test.ts", "orchestrator-model-proposal-emit.test.ts", "orchestrator-sentinel.test.ts", "orchestrator.test.ts", "spec-b-phase-3-dispatch-wiring.test.ts", "spec-b-phase-4-decision-bus.test.ts", "spec-b-phase-5-http-ws.test.ts", "telemetry-end-to-end.test.ts", "telemetry-latency.test.ts"]
---

## Summary

The `packages/orchestrator/tests/integration` module verifies end-to-end behavior of the orchestrator's routing control plane and multi-orchestrator claim coordination. Two core suites: (1) AMR routing endpoints test the full round-trip of policy ingestion, budget-driven tier degradation, and telemetry projection over HTTP, proving the live AdaptiveRouter swap and cost tracking against Shuttle's wire shape; (2) claim-coordination tests multi-orchestrator races for issue ownership, validating that the first claim wins, repeated claims are idempotent, and tracker state is authoritative. Collectively, they guard the integration seams between HTTP ingestion, routing dispatch, telemetry aggregation, and distributed claim verification.

## Invariants

- Policy PUT ingestion swaps the live AdaptiveRouter; before ingestion adaptiveRouter is null, after valid PUT it is non-null and routes under the pushed policy.
- Budget degradation tier-down is deterministic: when spend exceeds degradeAtPct of capUsd, the next routing decision downgrades one tier (e.g., strong → standard).
- Telemetry rows conform exactly to Shuttle's wire shape: each decision object has only [backend, decisionTs, estCostUsd, tierRequired] keys, in that sorted order.
- Cost aggregation is accurate: telemetry.spentUsd equals the sum of estCostUsd across all decisions, not sampled or approximated.
- Schema-invalid policies are rejected with 400 status and do not mutate routing state (adaptiveRouter remains unchanged).
- PUT {} with empty object restores default-off state end-to-end: adaptiveRouter becomes null and GET /status returns active=false.
- GET /status reflects the live budget state: active, capUsd, degradeAtPct, spentUsd, degrading flag all match the most recent policy PUT or null for default-off.
- Claim coordination is first-writer-wins: in a race, whichever orchestrator calls claimIssue first is recorded in the tracker's authoritative state, losers see rejected verdict on claimAndVerify.
- Claims are idempotent: repeated claimIssue calls for an already-claimed issue succeed (return Ok), but the assignee does not change.
- Release clears claimed state: releaseIssue removes the issueId from the claimedBy map, allowing a fresh claim by another orchestrator.

## Interface Contract

```ts

```

## Dependency Slice

```
import { AdaptiveRouter } from '../../src/agent/adaptive-router'
import { BackendRouter } from '../../src/agent/backend-router'
import { MockBackend } from '../../src/agent/backends/mock'
import { buildAnalysisProviderForLayer, buildIntelligencePipeline } from '../../src/agent/intelligence-factory'
import { LocalModelResolver } from '../../src/agent/local-model-resolver'
import { OrchestratorBackendFactory } from '../../src/agent/orchestrator-backend-factory'
import { buildRoutingUseCase } from '../../src/agent/use-case-builder'
import { ClaimManager } from '../../src/core/claim-manager'
import { wireTelemetryFanout } from '../../src/gateway/telemetry/fanout'
import from '../../src/gateway/webhooks/signer'
import { StructuredLogger } from '../../src/logging/logger'
import { Orchestrator } from '../../src/orchestrator'
import { RoutingDecisionBus } from '../../src/routing/decision-bus'
import { OrchestratorServer } from '../../src/server/http'
import { RoadmapTrackerAdapter } from '../../src/tracker/adapters/roadmap'
import { WorkspaceManager } from '../../src/workspace/manager'
import { noopExecFile } from '../helpers/noop-exec-file'
import { OTLPExporter, checkTaint } from '@harness-engineering/core'
import { AnthropicAnalysisProvider, ClaudeCliAnalysisProvider, OpenAICompatibleAnalysisProvider } from '@harness-engineering/intelligence'
import * as localModels, { EvictRequest, FrozenCandidate, InstallAdapter, InstallRequest, InstallResult, ModelProposalContent, PoolEntry, PoolFilesystem, PoolManager, PoolState, PoolStateStore, RankerCandidate, RefreshScheduler, RemoteModelInfo, TickResult } from '@harness-engineering/local-models'
import { BackendCapabilities, BackendDef, ComplexityVerdict, Err, GatewayEvent, Issue, IssueTrackerClient, LocalModelsConfig, Ok, RoutingConfig, RoutingDecision, RoutingPolicy, RoutingStatus, RoutingTelemetry, TrackerConfig, WebhookSubscription, WorkflowConfig } from '@harness-engineering/types'
import { execSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import * as fs, fs from 'node:fs'
import * as http from 'node:http'
import { AddressInfo } from 'node:net'
import * as os, os from 'node:os'
import * as path, path from 'node:path'
import { TestOptions, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
```
