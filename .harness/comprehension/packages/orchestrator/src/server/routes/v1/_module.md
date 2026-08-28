---
schemaVersion: 1
module: 'packages/orchestrator/src/server/routes/v1'
sourceHash: 'f0e33690cf5eb6ce3072c6fa2cee512a92e5fb67ddcaa6c96360321ac43fb6c9'
compiledAt: '2026-08-28T01:22:12.426Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'events-sse.test.ts',
    'events-sse.ts',
    'interactions-resolve.test.ts',
    'interactions-resolve.ts',
    'jobs-maintenance.test.ts',
    'jobs-maintenance.ts',
    'local-models-pool-mutation.ts',
    'local-models.ts',
    'proposals.test.ts',
    'proposals.ts',
    'routing.amr-endpoints.test.ts',
    'routing.test.ts',
    'routing.ts',
    'telemetry.test.ts',
    'telemetry.ts',
    'webhooks-url-guard.test.ts',
    'webhooks.test.ts',
    'webhooks.ts',
  ]
---

## Interface Contract

```ts
export SseEventLog
export getSseEventLog
export handleV1EventsSseRoute
export handleV1InteractionsResolveRoute
export handleV1JobsMaintenanceRoute
export handleV1LocalModelsMutationRoute
export handleV1LocalModelsRoute
export handleV1ProposalsRoute
export handleV1RoutingRoute
export handleV1TelemetryRoute
export handleV1WebhooksRoute
```

## Dependency Slice

```
import { BackendRouter, toArray } from '../../../agent/backend-router'
import { PrivacyNoMatch, buildCapabilityRegistry, selectCheapestQualifying } from '../../../agent/capability-registry'
import { estimateCost } from '../../../agent/cost-estimator'
import { InteractionQueue, PendingInteraction } from '../../../core/interaction-queue'
import { WebhookQueue } from '../../../gateway/webhooks/queue'
import { WebhookStore } from '../../../gateway/webhooks/store'
import { WebhookStore } from '../../../gateway/webhooks/store.js'
import { emitProposalApproved, emitProposalRejected } from '../../../proposals/events'
import { GateRunError, runGate } from '../../../proposals/gate'
import { MODEL_INSTALL_TOPIC, ModelHandlerDeps, ModelPoolOps, makeInstallProgressForwarder, onApproveModelProposal, onRejectModelProposal } from '../../../proposals/model-handlers'
import { ModelHandlerDeps, ModelPoolOps, makeInstallProgressForwarder, onApproveModelProposal } from '../../../proposals/model-handlers.js'
import { GateNotReadyError, PromotionError, promote } from '../../../proposals/promote'
import { RoutingDecisionBus } from '../../../routing/decision-bus'
import { RoutingPolicySchema } from '../../../workflow/schema'
import { readBody } from '../../utils'
import { readBody } from '../../utils.js'
import { HostLookup, guardOutboundHost, isPrivateAddress, isPrivateHost } from '../../utils/url-guard.js'
import { MaintenanceRouteDeps } from '../maintenance'
import { getSseEventLog, handleV1EventsSseRoute } from './events-sse'
import { handleV1InteractionsResolveRoute } from './interactions-resolve'
import { handleV1JobsMaintenanceRoute } from './jobs-maintenance'
import { handleV1ProposalsRoute } from './proposals'
import { RoutingRouteDeps, handleV1RoutingRoute } from './routing'
import { handleV1TelemetryRoute } from './telemetry'
import { handleV1WebhooksRoute } from './webhooks'
import { handleV1WebhooksRoute } from './webhooks.js'
import { CacheMetricsRecorder, ProposalNotFoundError, createModelProposal, createProposal, getProposal, listProposals, updateProposal } from '@harness-engineering/core'
import { deriveRequiredTier } from '@harness-engineering/intelligence'
import { EvictPoolResult, HardwareProfile, InstallPoolResult, PoolEntry, PoolState, PoolStateView, RankedModel, TickResult, estimateDiskGb, isTickHardFailure } from '@harness-engineering/local-models'
import { BackendDef, CapabilityTier, ComplexityLevel, ComplexityVerdict, EditProposalInputSchema, ModelProposalContent, PoolMutationResult, Proposal, ProposalStatus, RoutingConfig, RoutingDecision, RoutingPolicy, RoutingRisk, RoutingStatus, RoutingTelemetry, RoutingUseCase, RoutingValue, SkillProposal, TokenScope, WebhookSubscriptionPublicSchema } from '@harness-engineering/types'
import { randomBytes } from 'node:crypto'
import { EventEmitter } from 'node:events'
import * as fs, { mkdtempSync, rmSync } from 'node:fs'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import * as os, { tmpdir } from 'node:os'
import * as path, { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
```
