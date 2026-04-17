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
  RoutingDecision,
  EscalationConfig,
  IntelligenceConfig,
} from './orchestrator';
