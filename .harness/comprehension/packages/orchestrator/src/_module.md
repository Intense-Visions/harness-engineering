---
schemaVersion: 1
module: 'packages/orchestrator/src'
sourceHash: '903aa6526bcb7d4c4d0c87303ec5a6dc7a02955615004017f26238cecb3b4e31'
compiledAt: '2026-08-28T01:22:12.124Z'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'index.ts',
    'local-template-lint.test.ts',
    'orchestrator.default-verify-runner.test.ts',
    'orchestrator.dispatch-wiring.test.ts',
    'orchestrator.local-gate.test.ts',
    'orchestrator.quality-verdict.test.ts',
    'orchestrator.retrospective.test.ts',
    'orchestrator.routing-ingestion.test.ts',
    'orchestrator.template-resolution.test.ts',
    'orchestrator.ts',
  ]
---

## Interface Contract

```ts
export *
export AcceptanceOutcome
export AdaptiveRouter
export AdaptiveRouterDeps
export AgentDispatchResult
export AgentDispatcher
export AgentDispatcherDeps
export BRAINSTORM_RUBRIC
export BUILT_IN_TASKS
export BackendDefSchema
export BackendResolver
export BackendRouter
export BackendRouterOptions
export BrainstormWiringDeps
export BuildArchiveHooksOptions
export BuildWorkflowContextDeps
export CheckCommandResult
export CheckCommandRunner
export CheckFailureClassification
export CheckFailureKind
export CheckScriptRunner
export CommandExecResult
export CommandExecutor
export CreateTokenInput
export CreateTokenResult
export CustomTaskValidationError
export DEFAULT_POOL_STATE_PATH
export ECOSYSTEM_RULES
export Ecosystem
export EcosystemId
export EscalationState
export ExecFileAsyncFn
export ExecFileError
export FromConfigOptions
export GateNotReadyError
export GateResult
export GateRunError
export HarnessFitProbeRunner
export HarnessFitProbeRunnerDeps
export HarnessSpawn
export IndexedDoc
export LocalModelResolver
export LocalModelResolverOptions
export MAINTENANCE_CHECK_MAX_BUFFER
export MAINTENANCE_CHECK_TIMEOUT_MS
export MAX_ATTEMPTS
export MaintenanceReporter
export MaintenanceReporterOptions
export MarkSkip
export MarkSkipReason
export MigrationResult
export NotificationSink
export NotificationSinkDeliverInput
export OrchestratorBackendFactory
export OrchestratorBackendFactoryOptions
export PRLifecycleManager
export PersistedOutputEntry
export PoolState
export PoolStateProvider
export PoolStateStore
export PrivacyNoMatch
export ProbeWorkspace
export PromotionError
export PromotionResult
export ProposalApprovedData
export ProposalCreatedData
export ProposalRejectedData
export QueueInsertInput
export QueueRow
export QueueStats
export RETROSPECTION_PROPOSED_BY
export RETRY_DELAYS_MS
export RankProfile
export RankableCandidate
export RecordPrediction
export RegistryEntry
export ResolverLogger
export RetrospectionContext
export RetrospectionResult
export RoutingConfigSchema
export RoutingValueSchema
export RunHarnessCheckOptions
export RunMode
export RunOrigin
export RunResult
export SearchOptions
export SelForkGeneratorOptions
export SelectConstraints
export SinkConfigError
export SinkRegistry
export SlackSink
export SlackSinkOptions
export SqliteSearchIndex
export StoredOutcomeRecord
export SummarizeContext
export SummarizeResult
export SyncMainOptions
export SyncMainResult
export SyncSkipReason
export TaskDefinition
export TaskOutputStore
export TaskRunner
export TaskRunnerOptions
export TaskSelectionFilter
export TaskType
export TokenStore
export TriageMarkConfig
export TriageMarkDeps
export TriageMarkItem
export TriageMarkResult
export TriageVerdict
export TriageWiringDeps
export WebhookQueue
export WiredBrainstormResult
export WorkflowRouterDep
export brainstormInputFromIssue
export buildArchiveHooks
export buildCapabilityRegistry
export buildProbeInput
export buildWorkflowContext
export classifyCheckExecutionFailure
export createAgentDispatcher
export createBackend
export defaultFetchModels
export defaultPoolCapabilities
export detectEcosystem
export detectEcosystemFromFiles
export discoverCandidates
export emitProposalApproved
export emitProposalCreated
export emitProposalRejected
export enrichIssueWithSpec
export estimateCost
export explicitFindingsCount
export indexSessionDirectory
export isCheckTimeoutError
export isRetrospectionEnabled
export isSummaryEnabled
export makeBackendResolver
export makeGraphScope
export makeSelForkGenerator
export markApprovedForDispatch
export migrateAgentConfig
export normalizeFts5Query
export normalizeLocalModel
export openSearchIndex
export pilotScore
export poolStateToCandidates
export precedentLookupFromStored
export promote
export rankTriageCandidates
export recoverFindingsCount
export reindexFromArchive
export renderLlmSummaryMarkdown
export renderSpecMarkdown
export retrospectArchivedSession
export runBrainstormForIssue
export runGate
export runHarnessCheck
export searchIndexPath
export selectCheapestQualifying
export selectTasks
export slugFor
export summarizeArchivedSession
export syncMain
export triageIssue
export truncateForBudget
export validateCustomTasks
export wireNotificationSinks
export workflowFor
export wrapAsEnvelope
```

## Dependency Slice

```
import { AdaptiveRouter } from './agent/adaptive-router'
import { applyAnalysisEnv } from './agent/analysis-env'
import { buildAnalysisProvider } from './agent/analysis-provider-factory'
import { isLocalEndpointBackend, isLocalExecutionBackend } from './agent/backend-factory'
import { makeBackendResolver } from './agent/backend-resolver'
import { toArray } from './agent/backend-router'
import { MockBackend } from './agent/backends/mock.js'
import { buildTaskText } from './agent/complexity-request'
import { migrateAgentConfig } from './agent/config-migration'
import { HarnessFitProbeRunner } from './agent/harness-fit-runner'
import { buildAnalysisProviderForLayer, buildIntelligencePipeline } from './agent/intelligence-factory'
import { makeLiveClassify } from './agent/live-classify'
import { LocalModelResolver, defaultWarmModel, defaultWarmModelViaCompletion } from './agent/local-model-resolver'
import { OrchestratorBackendFactory } from './agent/orchestrator-backend-factory'
import { hasIntroducedSecurityDefect, outcomeVerdictToQualityFail } from './agent/quality-verdict'
import { IntroducedHunk } from './agent/quality-verdict.js'
import { AgentRunner } from './agent/runner'
import { buildTriageOutcomeInput, runRetrospective } from './agent/triage-outcome'
import { buildRoutingUseCase } from './agent/use-case-builder'
import { AuditLogger } from './auth/audit'
import { CompletionHandler } from './completion/handler'
import { AnalysisArchive } from './core/analysis-archive'
import { getBudgetStatus } from './core/budget-governor'
import { ClaimManager } from './core/claim-manager'
import { FlightRecorder, Verdict, gatherProvenance } from './core/flight-recorder'
import { applyEvent, isEligible, selectCandidates } from './core/index.js'
import { InteractionQueue } from './core/interaction-queue'
import { OrchestratorLaneSignal, PersistedLanes, persistLane, readPersistedLanes } from './core/lane-persistence'
import { resolveOrchestratorId } from './core/orchestrator-identity'
import { ExecFileFn, PRDetector } from './core/pr-detector'
import { computeRateLimitDelay } from './core/rate-limiter'
import { detectStalledIssues } from './core/stall-detector'
import { createEmptyState } from './core/state-helpers'
import { applyEvent } from './core/state-machine'
import { StreamRecorder } from './core/stream-recorder'
import { wireTelemetryFanout } from './gateway/telemetry/fanout'
import { WebhookDelivery } from './gateway/webhooks/delivery'
import { wireWebhookFanout } from './gateway/webhooks/events'
import { WebhookQueue } from './gateway/webhooks/queue'
import { WebhookStore } from './gateway/webhooks/store'
import { IntelligencePipelineRunner } from './intelligence/pipeline-runner'
import { StructuredLogger } from './logging/logger'
import { createAgentDispatcher } from './maintenance/agent-dispatcher'
import { MAINTENANCE_CHECK_MAX_BUFFER, MAINTENANCE_CHECK_TIMEOUT_MS, runHarnessCheck } from './maintenance/check-runner'
import { CheckScriptRunner } from './maintenance/check-script-runner'
import { ContextResolver, InlineSkillReader } from './maintenance/context-resolver'
import { validateCustomTasks } from './maintenance/custom-task-validator'
import { SingleProcessLeaderElector } from './maintenance/leader-elector'
import { TaskOutputStore } from './maintenance/output-store'
import { MaintenanceReporter } from './maintenance/reporter'
import { MaintenanceScheduler } from './maintenance/scheduler'
import { BUILT_IN_TASKS } from './maintenance/task-registry'
import { AgentDispatcher, CheckCommandRunner, CommandExecutor, TaskRunner } from './maintenance/task-runner'
import { wireNotificationSinks } from './notifications/events'
import { SinkRegistry } from './notifications/registry'
import { LOCAL_GATE_TIMEOUT_MS, Orchestrator, changedWorkspacePackages, defaultLocalAcceptanceRunner, defaultLocalVerifyRunner } from './orchestrator.js'
import { PromptRenderer } from './prompt/renderer'
import { redriveInstallingProposals } from './proposals/model-handlers'
import { RoutingDecisionBus } from './routing/decision-bus.js'
import { OrchestratorServer } from './server/http'
import { GitHubIssuesIssueTrackerAdapter } from './tracker/adapters/github-issues-issue-tracker'
import { RoadmapTrackerAdapter } from './tracker/adapters/roadmap'
import { ClaimEffect, EscalateEffect, OrchestratorEvent, SideEffect } from './types/events'
import { OrchestratorEvent, SideEffect } from './types/events.js'
import { LiveSession, OrchestratorState, RunningEntry } from './types/internal'
import { OrchestratorState } from './types/internal.js'
import { OrchestratorContext } from './types/orchestrator-context'
import { findUndocumentedAdditions, formatUndocumentedReason, needsDoc } from './workflow/doc-coverage-gate'
import { executeWorkflow } from './workflow/execute-workflow'
import { distillGateFailure } from './workflow/gate-feedback'
import { WorkflowLoader } from './workflow/loader'
import { buildWorkflowContext, documentStagePath, resolveLeafPrewarmSources } from './workflow/orchestrator-context'
import { resolvePeerUnloadFromConfig } from './workflow/peer-unload'
import { SkillCatalogEntry, discoverSkillCatalog } from './workflow/skill-catalog'
import { DEFAULT_REASONER_ASSIST_AFTER, REASONER_UNSTICK_TIMEOUT_MS, UNSTICK_SCHEMA, UNSTICK_SYSTEM_PROMPT, UnstickAdvice, buildUnstickPrompt, formatUnstickAdvisory, shouldRequestUnstickAdvice } from './workflow/unstick-advisory'
import { workflowFor } from './workflow/workflow-for'
import { scanWorkspaceConfig } from './workspace/config-scanner'
import { detectEcosystem } from './workspace/ecosystem'
import { WorkspaceHooks } from './workspace/hooks'
import { WorkspaceManager } from './workspace/manager'
import { CacheMetricsRecorder, GitHubIssuesSyncAdapter, Issue, IssueTrackerClient, OTLPExporter, SecurityScanner, TrackerClientConfig, applyResourceBudgets, createModelProposal, createTrackerClient, eventSourcing, listProposals, loadTrackerSyncConfig, sharedRateBudget, updateProposal, writeTaint } from '@harness-engineering/core'
import { GraphStore } from '@harness-engineering/graph'
import { AnalysisProvider, EnrichedSpec, IntelligencePipeline, OpenAICompatibleAnalysisProvider, OutcomeEvaluator, TriagePrediction } from '@harness-engineering/intelligence'
import { DEFAULT_HARNESS_FIT_TASKS, DedupPair, DedupPairs, DiscoverCandidatesOptions, DiscoverCandidatesResult, FrozenCandidate, HardwareDetector, HardwareProfile, HarnessFitCacheFileStore, HarnessFitProbeDeps, HarnessFitProbeTask, InstallAdapter, OllamaInstallAdapter, PoolManager, PoolStateProvider, PoolStateStore, RankerCandidate, RefreshScheduler, SchedulerTimerHandle, createBuildQualityReRanker, createNativeRecommender, curationFromCandidates, loadFrozenCandidates, probeToolCalling, runRefreshTick, selectCandidates } from '@harness-engineering/local-models'
import { AgentBackend, BackendDef, IntelligenceConfig, Issue, IssueTrackerClient, LeafContextSource, ModelProposalRecord, Ok, RoutingDecision, RoutingError, RoutingPolicy, RoutingRequest, RoutingStatus, RoutingTelemetry, StageRun, WorkflowConfig, WorkflowExecutionPlan } from '@harness-engineering/types'
import { execFile, execFileSync, execSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath } from 'node:url'
import from 'node:util'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
```
