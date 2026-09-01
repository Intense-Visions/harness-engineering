---
schemaVersion: 1
module: 'packages/types/src'
sourceHash: 'ffb7f71106c83f7c89cd308ae46b7a269a4b8a0942d2ceb9a09e3544c55cf694'
compiler: { static: '1.0.0', semantic: '1.0.0' }
model: null
semantic: absent
members:
  [
    'adoption.ts',
    'auth.ts',
    'caching.ts',
    'ci-notify.ts',
    'ci.ts',
    'container.ts',
    'fleet-claim.ts',
    'fleet-context-budget.ts',
    'fleet-handoff.ts',
    'fleet-spend-budget.ts',
    'identity.ts',
    'index.ts',
    'local-models.ts',
    'maintenance-findings.ts',
    'maintenance.ts',
    'notifications.ts',
    'orchestrator.ts',
    'plan-task.ts',
    'policy.ts',
    'proposals.ts',
    'pulse.ts',
    'result.ts',
    'roadmap.ts',
    'session-state.ts',
    'sessions.ts',
    'skill.ts',
    'solutions.ts',
    'strategy.ts',
    'telemetry-synthesis.ts',
    'telemetry.ts',
    'tracker-sync.ts',
    'usage.ts',
    'webhooks.ts',
    'workflow.ts',
  ]
---

## Interface Contract

```ts
export AdoptionSection
export AdoptionSnapshot
export AgentBackend
export AgentBudgetConfig
export AgentConfig
export AgentContextBudgetConfig
export AgentError
export AgentErrorCategory
export AgentEvent
export AgentSession
export AnthropicBackendDef
export AssignmentRecord
export AuthAuditEntry
export AuthAuditEntrySchema
export AuthToken
export AuthTokenPublic
export AuthTokenPublicSchema
export AuthTokenSchema
export BackendCapabilities
export BackendCapabilityRegistry
export BackendDef
export BlockerRef
export BridgeKind
export BridgeKindSchema
export BudgetEnvelopeStatus
export BudgetSnapshot
export BugTrackCategory
export CICheckIssue
export CICheckName
export CICheckOptions
export CICheckReport
export CICheckResult
export CICheckStatus
export CICheckSummary
export CIFailOnSeverity
export CIInitOptions
export CINotifyOptions
export CINotifyTarget
export CIPlatform
export CapabilityTier
export CheckScriptDefinition
export ClaudeBackendDef
export CleanupConfig
export CognitiveMode
export ComplexityLevel
export ComplexityVerdict
export ConcernSignal
export ConsentState
export ConstraintPackCompliance
export ConstraintPackComplianceStatus
export ConstraintPackStageCompliance
export ConstraintStage
export ContainerConfig
export ContainerCreateOpts
export ContainerError
export ContainerErrorCategory
export ContainerExecOpts
export ContainerHandle
export ContainerRuntime
export ContextBudget
export ContextBudgetSchema
export CustomTaskDefinition
export DEFAULT_RETRIEVAL_MODE
export DEFAULT_SKILL_CONTEXT_BUDGET
export DailyUsage
export EditProposalInput
export EditProposalInputSchema
export EffectivenessSection
export EmitSkillProposalInput
export EmitSkillProposalInputSchema
export Err
export EscalationConfig
export ExternalTicket
export ExternalTicketState
export FAILURE_CATEGORIES
export FLEET_CLAIM_VERSION
export FLEET_CONTEXT_BUDGET_VERSION
export FLEET_HANDOFF_BLOCKER_REQUIRED_STATUSES
export FLEET_HANDOFF_RECORD_VERSION
export FLEET_SPEND_BUDGET_VERSION
export FailureCategory
export FeatureStatus
export FleetBudgetStatus
export FleetClaim
export FleetClaimSchema
export FleetHandoffEvidence
export FleetHandoffEvidenceSchema
export FleetHandoffRecord
export FleetHandoffRecordSchema
export FleetHandoffStatus
export FleetHandoffStatusSchema
export FleetHandoffValidationError
export FleetHandoffValidationResult
export GateBound
export GateMeasurement
export GatewayEvent
export GatewayEventSchema
export GeminiBackendDef
export HarnessIdentity
export HooksConfig
export INDEXED_FILE_KINDS
export INSIGHTS_KEYS
export IdentityDomain
export IndexedFileKind
export InsightsAttentionBlock
export InsightsDecayBlock
export InsightsEntropyBlock
export InsightsHealthBlock
export InsightsImpactBlock
export InsightsKey
export InsightsReport
export InsightsSection
export IntelligenceConfig
export IsolationTier
export Issue
export IssueRoutingDecision
export IssueTrackerClient
export KnowledgeTrackCategory
export LeafBudgetVerdict
export LeafContextEstimate
export LeafContextEstimateSchema
export LeafContextSource
export LeafContextSourceSchema
export LeafContextSpend
export LeafContextSpendSchema
export LoadingLevel
export LocalBackendDef
export LocalModelStatus
export LocalModelsConfig
export LocalModelsHardwareOverride
export LocalModelsInstallerBackend
export LocalModelsInstallerConfig
export LocalModelsPlatform
export LocalModelsPoolConfig
export LocalModelsRefreshConfig
export MAINTENANCE_FINDINGS_CONTRACT_VERSION
export MaintenanceConfig
export MaintenanceFindingsContract
export MaintenanceHistoryEntry
export McpServerSpec
export MockBackendDef
export ModelInstallEvent
export ModelPricing
export ModelProposalAction
export ModelProposalActionSchema
export ModelProposalContent
export ModelProposalContentSchema
export ModelProposalRecord
export ModelProposalStatus
export ModelProposalStatusSchema
export NamedLocalModelStatus
export NotificationAction
export NotificationActionSchema
export NotificationDeliveryResult
export NotificationDeliveryResultSchema
export NotificationEnvelope
export NotificationEnvelopeSchema
export NotificationSeverity
export NotificationSeveritySchema
export NotificationSinkConfig
export NotificationSinkConfigSchema
export NotificationSinkKind
export NotificationSinkKindSchema
export NotificationsConfig
export NotificationsConfigSchema
export OPTIONAL_STRATEGY_SECTIONS
export OTLPKeyValue
export OTLPKeyValueSchema
export OTLPSpan
export OTLPSpanSchema
export ObservedSpend
export Ok
export OpenAIBackendDef
export OptionalStrategySection
export OsvGuardConfig
export OutcomeSection
export OutputRetentionConfig
export PiBackendDef
export PlanTask
export PlanTaskSchema
export PlannedSyncChanges
export PolicyApprovalMode
export PolicyApprovalModeSchema
export PolicyAuditEntry
export PolicyAuditEntrySchema
export PolicyMetadata
export PolicyMetadataSchema
export PolicyNetworkMode
export PolicyNetworkModeSchema
export PolicySandboxMode
export PolicySandboxModeSchema
export PollingConfig
export PoolInstallRequest
export PoolMutationDisposition
export PoolMutationResult
export PoolRemoveRequest
export Priority
export PrivacyClass
export PromptCacheStats
export PromptCacheStatsSchema
export Proposal
export ProposalContent
export ProposalContentSchema
export ProposalDecision
export ProposalDecisionSchema
export ProposalGate
export ProposalGateFinding
export ProposalGateFindingSchema
export ProposalGateSchema
export ProposalKind
export ProposalKindSchema
export ProposalSchema
export ProposalSource
export ProposalSourceSchema
export ProposalStatus
export ProposalStatusSchema
export ProposalType
export ProposalTypeSchema
export PulseAdapter
export PulseConfig
export PulseDbSource
export PulseRunStatus
export PulseRunStatusType
export PulseSkipKind
export PulseSkipRecord
export PulseSourceKind
export PulseSources
export PulseWindow
export REQUIRED_STRATEGY_SECTIONS
export ReindexStats
export RequiredStrategySection
export ResolutionSource
export ResolutionStep
export ResourceBudgetConfig
export Result
export RetrievalMode
export RetrospectionConfig
export RetrospectionProposalDraft
export RetrospectionProposalDraftSchema
export RetrospectionProposalsResponse
export RetrospectionProposalsResponseSchema
export Roadmap
export RoadmapAutoTriageConfig
export RoadmapConfig
export RoadmapFeature
export RoadmapFrontmatter
export RoadmapGroup
export RoadmapMilestone
export RoutingBudgetStatus
export RoutingConfig
export RoutingDecision
export RoutingError
export RoutingEscalationUnit
export RoutingPolicy
export RoutingRequest
export RoutingRisk
export RoutingStatus
export RoutingTaskText
export RoutingTelemetry
export RoutingTelemetryDecision
export RoutingUseCase
export RoutingValue
export RowSyncResult
export SESSIONS_DEFAULTS
export SESSION_SECTION_NAMES
export STANDARD_COGNITIVE_MODES
export SanitizeFn
export SanitizedResult
export ScopeTier
export SecretBackend
export SecretConfig
export SecretError
export SecretErrorCategory
export ServerConfig
export ServerlessBackendDef
export SessionEntry
export SessionEntryStatus
export SessionSearchConfig
export SessionSearchMatch
export SessionSearchResult
export SessionSectionName
export SessionSections
export SessionStartParams
export SessionSummarizationConfig
export SessionSummary
export SessionSummaryMeta
export SessionSummarySchema
export SessionUsage
export SessionsConfig
export SkillAdoptionSummary
export SkillContext
export SkillContextBudget
export SkillError
export SkillInvocationRecord
export SkillKind
export SkillKindSchema
export SkillLifecycleHooks
export SkillMetadata
export SkillProposal
export SkillProposalSchema
export SkillProvenance
export SkillProvenanceSchema
export SkillResult
export SkippedCreate
export SkippedStateChange
export SolutionCategory
export SolutionDocFrontmatter
export SolutionTrack
export SourceAbsent
export SpendEnvelope
export SpendEnvelopeSchema
export SpendEnvelopeVerdict
export SshBackendDef
export StabilityMetadata
export StabilityTier
export StageRun
export StagedWorkflowDecl
export StepOutcome
export StrategyDoc
export StrategyFrontmatter
export StrategySection
export StrategySectionName
export SuppressedInbound
export SyncDenominator
export SyncResult
export SynthesisSection
export TELEMETRY_SYNTHESIS_SECTIONS
export TaskCostCeilingConfig
export TaskOverride
export TelemetryConfig
export TelemetryEvent
export TelemetryIdentity
export TelemetrySynthesis
export TelemetrySynthesisHeadline
export TelemetrySynthesisSection
export TokenScope
export TokenScopeSchema
export TokenUsage
export TrackerComment
export TrackerConfig
export TrackerSyncConfig
export TrajectoryMetadata
export TrajectoryMetadataSchema
export TurnContext
export TurnParams
export TurnResult
export UsageRecord
export UsageSection
export VerdictCacheEntry
export VerdictCacheStats
export WebhookDelivery
export WebhookDeliverySchema
export WebhookDeliveryStatus
export WebhookDeliveryStatusSchema
export WebhookSubscription
export WebhookSubscriptionPublic
export WebhookSubscriptionPublicSchema
export WebhookSubscriptionSchema
export Workflow
export WorkflowConfig
export WorkflowDefinition
export WorkflowExecutionPlan
export WorkflowResult
export WorkflowStep
export WorkflowStepResult
export WorkspaceConfig
export formatFindingsContract
export isErr
export isOk
export migrateProposalRecord
export parseFindingsContract
export parseFleetHandoffRecord
export safeParseLeafContextEstimate
export validateFleetHandoffRecord
export validateLeafContextEstimate
export validateSpendEnvelope
```

## Dependency Slice

```
import { StabilityTier } from './caching'
import { ContainerConfig, SecretConfig } from './container'
import { MaintenanceConfig } from './maintenance'
import { CapabilityTier, ComplexityVerdict, RoutingDecision, RoutingRisk, TokenUsage } from './orchestrator'
import { Result } from './result'
import { FeatureStatus } from './roadmap'
import { SessionsConfig } from './sessions'
import { z } from 'zod'
```
