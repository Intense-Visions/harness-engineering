---
schemaVersion: 1
module: 'packages/orchestrator/tests/integration'
sourceHash: '0d9b8abf16358a7b75d00f28627f312a5f8ae4eff87a47292c2cef1ed1f4f275'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'amr-routing-endpoints-e2e.test.ts',
    'claim-coordination.test.ts',
    'file-backed-coordination.test.ts',
    'intelligence-pipeline-routing.test.ts',
    'orchestrator-local-resolver.test.ts',
    'orchestrator-model-pool.test.ts',
    'orchestrator-model-proposal-emit.test.ts',
    'orchestrator-sentinel.test.ts',
    'orchestrator.test.ts',
    'spec-b-phase-3-dispatch-wiring.test.ts',
    'spec-b-phase-4-decision-bus.test.ts',
    'spec-b-phase-5-http-ws.test.ts',
    'telemetry-end-to-end.test.ts',
    'telemetry-latency.test.ts',
  ]
---

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
