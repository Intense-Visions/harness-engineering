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
 *   roadmap.ts   — FeatureStatus, RoadmapFeature, RoadmapMilestone, Roadmap
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
  CICheckResult,
  CICheckSummary,
  CICheckReport,
  CIFailOnSeverity,
  CICheckOptions,
  CIPlatform,
  CIInitOptions,
} from './ci';

// --- CI Notify ---
export type { CINotifyTarget, CINotifyOptions } from './ci-notify';

// --- Roadmap ---
export type {
  FeatureStatus,
  Priority,
  RoadmapFeature,
  RoadmapMilestone,
  AssignmentRecord,
  RoadmapFrontmatter,
  Roadmap,
} from './roadmap';

// --- Tracker Sync ---
export type {
  ExternalTicket,
  ExternalTicketState,
  SyncResult,
  TrackerSyncConfig,
  TrackerComment,
} from './tracker-sync';

// --- Usage & Cost Tracking ---
export type { UsageRecord, ModelPricing, DailyUsage, SessionUsage } from './usage';

// --- Adoption Telemetry ---
export type { SkillInvocationRecord, SkillAdoptionSummary, AdoptionSnapshot } from './adoption';

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
  ServerConfig,
  WorkflowConfig,
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
} from './orchestrator';

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

// --- Auth (Hermes Phase 0) ---
export {
  TokenScopeSchema,
  BridgeKindSchema,
  AuthTokenSchema,
  AuthTokenPublicSchema,
  AuthAuditEntrySchema,
} from './auth';
export type { TokenScope, BridgeKind, AuthToken, AuthTokenPublic, AuthAuditEntry } from './auth';

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
} from './local-models';

// --- Plan task (parallel execution data model) ---
export { PlanTaskSchema } from './plan-task';
export type { PlanTask } from './plan-task';

// --- Skill Proposals (Hermes Phase 4) ---
export {
  SkillProvenanceSchema,
  ProposalKindSchema,
  ProposalStatusSchema,
  ProposalGateFindingSchema,
  ProposalGateSchema,
  ProposalDecisionSchema,
  ProposalContentSchema,
  ProposalSourceSchema,
  SkillProposalSchema,
  EmitSkillProposalInputSchema,
  EditProposalInputSchema,
} from './proposals';
export type {
  SkillProvenance,
  ProposalKind,
  ProposalStatus,
  ProposalGateFinding,
  ProposalGate,
  ProposalDecision,
  ProposalContent,
  ProposalSource,
  SkillProposal,
  EmitSkillProposalInput,
  EditProposalInput,
} from './proposals';
