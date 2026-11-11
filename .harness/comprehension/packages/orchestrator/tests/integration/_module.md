---
schemaVersion: 1
module: 'packages/orchestrator/tests/integration'
sourceHash: '58b352550571dd39a44406978f757f7b3ff6dda860f3e3b3da229d9050a35ae9'
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
import { removeTempDirSafely } from '../../../../tests/helpers/remove-temp-dir'
import { AdaptiveRouter } from '../../src/agent/adaptive-router'
import { BackendRouter } from '../../src/agent/backend-router'
import { MockBackend } from '../../src/agent/backends/mock'
import { buildAnalysisProviderForLayer, buildIntelligencePipeline } from '../../src/agent/intelligence-factory'
import { LocalModelResolver } from '../../src/agent/local-model-resolver'
import { OrchestratorBackendFactory } from '../../src/agent/orchestrator-backend-factory'
import { buildRoutingUseCase } from '../../src/agent/use-case-builder'
import { ClaimManager } from '../../src/core/claim-manager'
import { wireTelemetryFanout } from '../../src/gateway/telemetry/fanout'
import '../../src/gateway/webhooks/signer'
import { StructuredLogger } from '../../src/logging/logger'
import { Orchestrator } from '../../src/orchestrator'
import { RoutingDecisionBus } from '../../src/routing/decision-bus'
import { OrchestratorServer } from '../../src/server/http'
import { RoadmapTrackerAdapter } from '../../src/tracker/adapters/roadmap'
import { WorkspaceManager } from '../../src/workspace/manager'
import { noopExecFile } from '../helpers/noop-exec-file'
import { OTLPExporter, checkTaint } from '@harness-engineering/core'
import { AnthropicAnalysisProvider, ClaudeCliAnalysisProvider, OpenAICompatibleAnalysisProvider } from '@harness-engineering/intelligence'
import { EvictRequest, FrozenCandidate, InstallAdapter, InstallRequest, InstallResult, ModelProposalContent, PoolEntry, PoolFilesystem, PoolManager, PoolState, PoolStateStore, RankerCandidate, RefreshScheduler, RemoteModelInfo, TickResult } from '@harness-engineering/local-models'
import * as localModels from '@harness-engineering/local-models'
import { BackendCapabilities, BackendDef, ComplexityVerdict, Err, GatewayEvent, Issue, IssueTrackerClient, LocalModelsConfig, Ok, RoutingConfig, RoutingDecision, RoutingPolicy, RoutingStatus, RoutingTelemetry, TrackerConfig, WebhookSubscription, WorkflowConfig } from '@harness-engineering/types'
import { execSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import fs, * as fs from 'node:fs'
import * as http from 'node:http'
import { AddressInfo } from 'node:net'
import os, * as os from 'node:os'
import path, * as path from 'node:path'
import { TestOptions, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'
```
