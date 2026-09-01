/**
 * @harness-engineering/types
 *
 * Core types and interfaces for Harness Engineering toolkit.
 *
 * Types are organized into domain files for reduced blast radius:
 *   result.ts   — Result<T,E>, Ok, Err, isOk, isErr
 *   workflow.ts  — WorkflowStep, Workflow, StepOutcome, WorkflowStepResult, WorkflowResult
 *   skill.ts     — SkillMetadata, SkillContext, TurnContext, SkillError, SkillResult, SkillLifecycleHooks
 *   ci.ts        — CICheck*, CIInitOptions, CIPlatform
 *   roadmap.ts   — FeatureStatus, RoadmapFeature, RoadmapMilestone, RoadmapGroup, Roadmap
 */

// --- Result ---
export { Ok, Err, isOk, isErr } from './result';
export type { Result } from './result';

// --- Workflow ---
export type {
  WorkflowStep,
  Workflow,
  StepOutcome,
  WorkflowStepResult,
  WorkflowResult,
  WorkflowExecutionPlan,
  StageRun,
} from './workflow';

// --- Skill & Pipeline ---
export { STANDARD_COGNITIVE_MODES, DEFAULT_SKILL_CONTEXT_BUDGET } from './skill';
export type {
  CognitiveMode,
  SkillMetadata,
  SkillContext,
  TurnContext,
  SkillError,
  SkillResult,
  SkillLifecycleHooks,
  SkillContextBudget,
  LoadingLevel,
} from './skill';

// --- CI/CD ---
export type {
  CICheckName,
  CICheckStatus,
  CICheckIssue,
  GateBound,
  GateMeasurement,
  CICheckResult,
  CICheckSummary,
  CICheckReport,
  VerdictCacheEntry,
  VerdictCacheStats,
  CIFailOnSeverity,
  CICheckOptions,
  CIPlatform,
  CIInitOptions,
  ConstraintStage,
  ConstraintPackComplianceStatus,
  ConstraintPackStageCompliance,
  ConstraintPackCompliance,
} from './ci';

// --- CI Notify ---
export type { CINotifyTarget, CINotifyOptions } from './ci-notify';

// --- Roadmap ---
export type {
  FeatureStatus,
  Priority,
  RoadmapFeature,
  RoadmapMilestone,
  RoadmapGroup,
  AssignmentRecord,
  RoadmapFrontmatter,
  Roadmap,
} from './roadmap';

// --- Tracker Sync ---
export type {
  ExternalTicket,
  ExternalTicketState,
  SyncResult,
  RowSyncResult,
  SkippedCreate,
  SkippedStateChange,
  SuppressedInbound,
  SyncDenominator,
  PlannedSyncChanges,
  TrackerSyncConfig,
  TrackerComment,
} from './tracker-sync';

// --- Usage & Cost Tracking ---
export type { UsageRecord, ModelPricing, DailyUsage, SessionUsage } from './usage';

// --- Adoption Telemetry ---
export type {
  SkillInvocationRecord,
  SkillAdoptionSummary,
  AdoptionSnapshot,
  FailureCategory,
} from './adoption';
export { FAILURE_CATEGORIES } from './adoption';

// --- Session State ---
export { SESSION_SECTION_NAMES } from './session-state';
export type {
  SessionSectionName,
  SessionEntryStatus,
  SessionEntry,
  SessionSections,
} from './session-state';

// --- Caching / Stability Classification ---
export type { StabilityTier, StabilityMetadata } from './caching';

// --- Telemetry ---
export type { TelemetryConfig, TelemetryIdentity, ConsentState, TelemetryEvent } from './telemetry';
export {
  TrajectoryMetadataSchema,
  PromptCacheStatsSchema,
  OTLPKeyValueSchema,
  OTLPSpanSchema,
} from './telemetry';
export type { TrajectoryMetadata, PromptCacheStats, OTLPKeyValue, OTLPSpan } from './telemetry';

// --- Orchestrator ---
export type {
  TokenUsage,
  BlockerRef,
  Issue,
  AgentErrorCategory,
  AgentError,
  SessionStartParams,
  AgentSession,
  TurnParams,
  AgentEvent,
  TurnResult,
  AgentBackend,
  IssueTrackerClient,
  TrackerConfig,
  PollingConfig,
  WorkspaceConfig,
  HooksConfig,
  AgentConfig,
  // --- #1525: unattended-dispatch budget governor ---
  AgentBudgetConfig,
  BudgetEnvelopeStatus,
  FleetBudgetStatus,
  // --- #1524: per-leaf context-replay budget ---
  AgentContextBudgetConfig,
  // --- #1532: per-resource fan-out rate-limit budgets ---
  ResourceBudgetConfig,
  ServerConfig,
  WorkflowConfig,
  RoadmapConfig,
  RoadmapAutoTriageConfig,
  StagedWorkflowDecl,
  WorkflowDefinition,
  ScopeTier,
  ConcernSignal,
  IssueRoutingDecision,
  EscalationConfig,
  IntelligenceConfig,
  LocalModelStatus,
  // --- Spec 2: Multi-Backend Routing ---
  BackendDef,
  MockBackendDef,
  ClaudeBackendDef,
  AnthropicBackendDef,
  OpenAIBackendDef,
  GeminiBackendDef,
  LocalBackendDef,
  PiBackendDef,
  McpServerSpec,
  RoutingConfig,
  RoutingUseCase,
  NamedLocalModelStatus,
  // --- Hermes Phase 5: Dispatch Hardening ---
  IsolationTier,
  SshBackendDef,
  ServerlessBackendDef,
  // --- Spec B Phase 0: Granular Task→Backend Routing (types-only) ---
  RoutingValue,
  RoutingDecision,
  ResolutionStep,
  ResolutionSource,
  // --- AMR Phase 1: capability registry (types-only) ---
  CapabilityTier,
  PrivacyClass,
  BackendCapabilities,
  BackendCapabilityRegistry,
  // --- AMR Phase 2: complexity cascade + routing policy (types-only) ---
  ComplexityLevel,
  ComplexityVerdict,
  RoutingRisk,
  RoutingRequest,
  RoutingTaskText,
  BudgetSnapshot,
  RoutingPolicy,
  // --- AMR Phase 5: telemetry projection wire types (types-only) ---
  RoutingTelemetryDecision,
  RoutingTelemetry,
  // --- AMR observability: operator status types (types-only) ---
  RoutingBudgetStatus,
  RoutingEscalationUnit,
  RoutingStatus,
  // --- #1524 deferred slice: graph-scoped leaf-context assembly ---
  RetrievalMode,
} from './orchestrator';

// --- AMR Phase 4: routing error (value/class export, D10) ---
export { RoutingError } from './orchestrator';

// --- #1524 deferred slice: default retrieval mode (value export) ---
export { DEFAULT_RETRIEVAL_MODE } from './orchestrator';

// --- Container & Secrets ---
export type {
  ContainerErrorCategory,
  ContainerError,
  ContainerCreateOpts,
  ContainerExecOpts,
  ContainerHandle,
  ContainerRuntime,
  SecretErrorCategory,
  SecretError,
  SecretBackend,
  ContainerConfig,
  SecretConfig,
} from './container';

// --- Pulse (read-side observability) ---
export type {
  PulseConfig,
  PulseSources,
  PulseDbSource,
  SanitizedResult,
  SanitizeFn,
  PulseWindow,
  PulseAdapter,
  PulseRunStatusType,
  PulseRunStatus,
  PulseSkipKind,
  PulseSkipRecord,
  PulseSourceKind,
} from './pulse';

// --- Solutions (compound learning docs) ---
export type {
  SolutionTrack,
  BugTrackCategory,
  KnowledgeTrackCategory,
  SolutionCategory,
  SolutionDocFrontmatter,
} from './solutions';

// --- Strategy (STRATEGY.md upstream anchor) ---
export { REQUIRED_STRATEGY_SECTIONS, OPTIONAL_STRATEGY_SECTIONS } from './strategy';
export type {
  StrategyFrontmatter,
  StrategySection,
  StrategyDoc,
  StrategySectionName,
  RequiredStrategySection,
  OptionalStrategySection,
} from './strategy';

// --- Maintenance ---
export type {
  MaintenanceConfig,
  TaskOverride,
  MaintenanceHistoryEntry,
  CustomTaskDefinition,
  CheckScriptDefinition,
  OutputRetentionConfig,
  TaskCostCeilingConfig,
  CleanupConfig,
  OsvGuardConfig,
} from './maintenance';

// --- Maintenance findings contract (#691) ---
export {
  MAINTENANCE_FINDINGS_CONTRACT_VERSION,
  formatFindingsContract,
  parseFindingsContract,
} from './maintenance-findings';
export type { MaintenanceFindingsContract } from './maintenance-findings';

// --- Auth (Hermes Phase 0) ---
export {
  TokenScopeSchema,
  BridgeKindSchema,
  AuthTokenSchema,
  AuthTokenPublicSchema,
  AuthAuditEntrySchema,
} from './auth';
export type { TokenScope, BridgeKind, AuthToken, AuthTokenPublic, AuthAuditEntry } from './auth';

// --- Policy envelope + governance audit (orchestrator gateway policy envelope) ---
export {
  PolicyApprovalModeSchema,
  PolicySandboxModeSchema,
  PolicyNetworkModeSchema,
  PolicyMetadataSchema,
  PolicyAuditEntrySchema,
} from './policy';
export type {
  PolicyApprovalMode,
  PolicySandboxMode,
  PolicyNetworkMode,
  PolicyMetadata,
  PolicyAuditEntry,
} from './policy';

// --- Webhooks (Hermes Phase 0 — Phase 4) ---
export {
  WebhookSubscriptionSchema,
  WebhookSubscriptionPublicSchema,
  GatewayEventSchema,
  WebhookDeliveryStatusSchema,
  WebhookDeliverySchema,
} from './webhooks';
export type {
  WebhookSubscription,
  WebhookSubscriptionPublic,
  GatewayEvent,
  WebhookDeliveryStatus,
  WebhookDelivery,
} from './webhooks';

// --- Session search + insights ---
export {
  SessionSummarySchema,
  INDEXED_FILE_KINDS,
  INSIGHTS_KEYS,
  SESSIONS_DEFAULTS,
} from './sessions';
export type {
  IndexedFileKind,
  SessionSummary,
  SessionSummaryMeta,
  SessionSearchMatch,
  SessionSearchResult,
  ReindexStats,
  InsightsKey,
  InsightsHealthBlock,
  InsightsEntropyBlock,
  InsightsDecayBlock,
  InsightsAttentionBlock,
  InsightsImpactBlock,
  InsightsReport,
  SessionSummarizationConfig,
  SessionSearchConfig,
  RetrospectionConfig,
  SessionsConfig,
} from './sessions';

// --- Notifications ---
export {
  NotificationSinkKindSchema,
  NotificationSeveritySchema,
  NotificationActionSchema,
  NotificationEnvelopeSchema,
  NotificationSinkConfigSchema,
  NotificationsConfigSchema,
  NotificationDeliveryResultSchema,
} from './notifications';
export type {
  NotificationSinkKind,
  NotificationSeverity,
  NotificationAction,
  NotificationEnvelope,
  NotificationSinkConfig,
  NotificationsConfig,
  NotificationDeliveryResult,
} from './notifications';

// --- Local Model Lifecycle Manager (LMLM) — Phase 0 ---
export type {
  LocalModelsPlatform,
  LocalModelsInstallerBackend,
  LocalModelsHardwareOverride,
  LocalModelsPoolConfig,
  LocalModelsRefreshConfig,
  LocalModelsInstallerConfig,
  LocalModelsConfig,
  PoolInstallRequest,
  PoolRemoveRequest,
  PoolMutationDisposition,
  PoolMutationResult,
  ModelInstallEvent,
} from './local-models';

// --- Plan task (parallel execution data model) ---
export { PlanTaskSchema } from './plan-task';
export type { PlanTask } from './plan-task';

// --- Skill Proposals (Hermes Phase 4) ---
export {
  SkillProvenanceSchema,
  ProposalKindSchema,
  SkillKindSchema,
  ProposalTypeSchema,
  ProposalStatusSchema,
  ProposalGateFindingSchema,
  ProposalGateSchema,
  ProposalDecisionSchema,
  ProposalContentSchema,
  ProposalSourceSchema,
  SkillProposalSchema,
  ProposalSchema,
  ModelProposalActionSchema,
  ModelProposalStatusSchema,
  ModelProposalContentSchema,
  migrateProposalRecord,
  EmitSkillProposalInputSchema,
  EditProposalInputSchema,
  RetrospectionProposalDraftSchema,
  RetrospectionProposalsResponseSchema,
} from './proposals';
export type {
  SkillProvenance,
  ProposalKind,
  SkillKind,
  ProposalType,
  ProposalStatus,
  ProposalGateFinding,
  ProposalGate,
  ProposalDecision,
  ProposalContent,
  ProposalSource,
  SkillProposal,
  Proposal,
  ModelProposalAction,
  ModelProposalStatus,
  ModelProposalContent,
  ModelProposalRecord,
  EmitSkillProposalInput,
  EditProposalInput,
  RetrospectionProposalDraft,
  RetrospectionProposalsResponse,
} from './proposals';

// --- Identity ---
export type { HarnessIdentity, IdentityDomain } from './identity';

// --- Fleet Handoff (canonical bounded worker report, #1396) ---
export {
  FLEET_HANDOFF_RECORD_VERSION,
  FLEET_HANDOFF_BLOCKER_REQUIRED_STATUSES,
  FleetHandoffStatusSchema,
  FleetHandoffEvidenceSchema,
  FleetHandoffRecordSchema,
  validateFleetHandoffRecord,
  parseFleetHandoffRecord,
} from './fleet-handoff';
export type {
  FleetHandoffStatus,
  FleetHandoffEvidence,
  FleetHandoffRecord,
  FleetHandoffValidationError,
  FleetHandoffValidationResult,
} from './fleet-handoff';

// --- Fleet Claim (cross-run advisory work-claim lease, fleet-cross-run-claim-lease) ---
export { FLEET_CLAIM_VERSION, FleetClaimSchema } from './fleet-claim';
export type { FleetClaim } from './fleet-claim';

// --- Fleet Context Budget (per-leaf context-replay budget, context-replay-budget-per-leaf, #1524) ---
export {
  FLEET_CONTEXT_BUDGET_VERSION,
  LeafContextSourceSchema,
  LeafContextEstimateSchema,
  ContextBudgetSchema,
  LeafContextSpendSchema,
  validateLeafContextEstimate,
  safeParseLeafContextEstimate,
} from './fleet-context-budget';
export type {
  LeafContextSource,
  LeafContextEstimate,
  ContextBudget,
  LeafContextSpend,
  LeafBudgetVerdict,
} from './fleet-context-budget';

// --- Fleet Spend Budget (shared spend envelope, orchestrator + fleet-command, #1600) ---
export {
  FLEET_SPEND_BUDGET_VERSION,
  SpendEnvelopeSchema,
  validateSpendEnvelope,
} from './fleet-spend-budget';
export type { SpendEnvelope, ObservedSpend, SpendEnvelopeVerdict } from './fleet-spend-budget';

// --- Telemetry synthesis (#563) ---
export { TELEMETRY_SYNTHESIS_SECTIONS } from './telemetry-synthesis';
export type {
  TelemetrySynthesisSection,
  SourceAbsent,
  SynthesisSection,
  AdoptionSection,
  EffectivenessSection,
  UsageSection,
  InsightsSection,
  OutcomeSection,
  TelemetrySynthesisHeadline,
  TelemetrySynthesis,
} from './telemetry-synthesis';
