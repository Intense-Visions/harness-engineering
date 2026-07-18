/**
 * @harness-engineering/orchestrator
 *
 * Orchestrator daemon for dispatching coding agents to issues.
 *
 * This package provides the core logic for the Harness Orchestrator,
 * including state management, issue tracker adapters, agent runners,
 * and a management server.
 */

export * from './types/index';
export * from './core/index';
export * from './workflow/loader';
export * from './workflow/config';
export * from './workflow/skill-catalog';
// split-routing Phase 4: the doubly-opt-in staged-dispatch surface.
// `workflowFor` (pure >=2-stage predicate) + `buildWorkflowContext` (the real
// WorkflowEngineContext composition) so external consumers / tests can select
// and compose staged dispatch without reaching into internal paths.
export { workflowFor } from './workflow/workflow-for';
export { buildWorkflowContext } from './workflow/orchestrator-context';
export type { BuildWorkflowContextDeps, WorkflowRouterDep } from './workflow/orchestrator-context';
export * from './tracker/adapters/roadmap';
export * from './tracker/extensions/linear';
export * from './workspace/manager';
export * from './workspace/hooks';
// Backend implementations are internal — use Orchestrator's factory methods instead.
// Re-exporting only the mock backend for test consumers.
export * from './agent/backends/mock';
export * from './prompt/renderer';
export * from './orchestrator';
export * from './tui/launcher';
// Spec 2 Phase 3 / Task 14: re-export the multi-backend-routing surface
// so external consumers (CLI commands, tests, dashboards) can construct
// routers, factories, and migration helpers without reaching into
// internal paths.
export { BackendRouter } from './agent/backend-router';
export type { BackendRouterOptions } from './agent/backend-router';
// AMR Phase 3: adaptive-routing surface (wraps BackendRouter) + the Phase-1
// capability-selection primitives it composes. Exported so the server/CLI
// `routing trace` dry-run and external consumers can derive tier + cost.
export { AdaptiveRouter } from './agent/adaptive-router';
export type { AdaptiveRouterDeps } from './agent/adaptive-router';
// Harness-Fit Probe Phase 2 (D3): the injected I/O runner that implements
// local-models' `HarnessFitRunner` interface — a single OllamaBackend dispatch in
// a throwaway workspace, judged by the task's acceptance command, with
// act-vs-narrate metrics from the recording stream. The composition root provides
// this impl to local-models' probe policy (scheduler gating is Phase 3).
export { HarnessFitProbeRunner } from './agent/harness-fit-runner';
export type {
  HarnessFitProbeRunnerDeps,
  AcceptanceOutcome,
  ProbeWorkspace,
} from './agent/harness-fit-runner';
// Roadmap Auto-Triage Phase 1: the orchestrator-side probe wiring (Issue→ProbeInput,
// GraphScope seam, triageIssue). The pure probe/rank live in @harness-engineering/intelligence.
export { buildProbeInput, makeGraphScope, triageIssue } from './agent/triage-wiring';
export { rankTriageCandidates, pilotScore } from './agent/triage-wiring';
export type { TriageWiringDeps, RankableCandidate, TriageVerdict } from './agent/triage-wiring';
// Roadmap Auto-Triage Phase 2: the orchestrator-side brainstorm wiring (real SEL fork
// generator + self-consistency, spec doc write, SC4 re-score). The pure runner/types live
// in @harness-engineering/intelligence.
export {
  runBrainstormForIssue,
  makeSelForkGenerator,
  brainstormInputFromIssue,
  enrichIssueWithSpec,
  renderSpecMarkdown,
  slugFor,
  BRAINSTORM_RUBRIC,
} from './agent/brainstorm-wiring';
export type {
  BrainstormWiringDeps,
  WiredBrainstormResult,
  SelForkGeneratorOptions,
} from './agent/brainstorm-wiring';
// Roadmap Auto-Triage Phase 3: the dispatch MARKER (makes an approved item eligible for the
// EXISTING pickup loop + records the pre-dispatch prediction). No new dispatch path.
export { markApprovedForDispatch } from './agent/triage-mark';
export type {
  TriageMarkItem,
  TriageMarkConfig,
  TriageMarkDeps,
  TriageMarkResult,
  MarkSkip,
  MarkSkipReason,
  RecordPrediction,
} from './agent/triage-mark';
// Roadmap Auto-Triage Phase 4 (SC5): the REAL PrecedentLookup over recorded outcomes —
// bridges core's StoredTriageRecord into intelligence's pure `aggregatePrecedent`. The
// read-side lever the CLI report/approve paths inject so the gate reads real base-rates
// once outcomes accrue (cold-start ⇒ `unknown` ⇒ byte-identical to today).
export { precedentLookupFromStored } from './agent/triage-outcome';
export type { StoredOutcomeRecord } from './agent/triage-outcome';
// AMR Phase 4 (D10/SC16): vertical escalation mechanism.
export { EscalationState } from './agent/escalation-state';
export {
  selectCheapestQualifying,
  buildCapabilityRegistry,
  defaultPoolCapabilities,
  PrivacyNoMatch,
} from './agent/capability-registry';
export type { SelectConstraints } from './agent/capability-registry';
export { estimateCost } from './agent/cost-estimator';
export { OrchestratorBackendFactory } from './agent/orchestrator-backend-factory';
export type { OrchestratorBackendFactoryOptions } from './agent/orchestrator-backend-factory';
export { migrateAgentConfig } from './agent/config-migration';
export type { MigrationResult } from './agent/config-migration';
export { createBackend } from './agent/backend-factory';
// Shared maintenance backend resolver. The ONE implementation of "backend
// name → live AgentBackend via createBackend, else null", consumed by both
// the cron orchestrator (createMaintenanceTaskRunner) and the on-demand CLI
// (`harness maintenance run --fix`) so the two resolution sites cannot drift.
export { makeBackendResolver } from './agent/backend-resolver';
export type { BackendResolver } from './agent/backend-resolver';

// Re-export the workflow Zod schemas so other packages (cli config, tests)
// can validate `agent.backends` / `agent.routing` against the same source
// of truth used by the orchestrator at runtime.
export { BackendDefSchema, RoutingConfigSchema, RoutingValueSchema } from './workflow/schema';

// Re-export the local-model probe primitives so the craft skill family
// (and any other downstream consumer) can resolve `/v1/models` against
// the same fetch/normalize implementation the orchestrator runtime uses.
export {
  defaultFetchModels,
  normalizeLocalModel,
  LocalModelResolver,
} from './agent/local-model-resolver';
export type { LocalModelResolverOptions, ResolverLogger } from './agent/local-model-resolver';

// Phase 1 sync-main helper public surface. Wired into the maintenance
// scheduler in Phase 2; exported here so the CLI can wrap it directly.
export { syncMain } from './maintenance/sync-main';
export type { SyncMainResult, SyncMainOptions, SyncSkipReason } from './maintenance/sync-main';

// Hermes Phase 2 — public surface for the maintenance CLI subcommand
// (`harness maintenance list/show`). The CLI consumes these directly so it
// can read built-in + custom task definitions and the per-task output store
// without booting a full orchestrator instance.
export { BUILT_IN_TASKS } from './maintenance/task-registry';
export { TaskOutputStore } from './maintenance/output-store';
export type { PersistedOutputEntry } from './maintenance/output-store';
export { validateCustomTasks } from './maintenance/custom-task-validator';
export type { CustomTaskValidationError } from './maintenance/custom-task-validator';
export type { TaskDefinition, TaskType, RunOrigin, RunMode } from './maintenance/types';

// On-demand maintenance pipeline (Phase 2) — overdue/selection helper consumed
// by the `harness maintenance run` CLI subcommand without booting an orchestrator.
export { selectTasks } from './maintenance/overdue';
export type { TaskSelectionFilter } from './maintenance/overdue';

// On-demand maintenance pipeline (Phase 3) — CLI `run` subcommand surface.
// The CLI builds an infra-free TaskRunner (report mode), reads/records history
// via MaintenanceReporter, and runs custom `checkScript` tasks via CheckScriptRunner,
// all without booting an orchestrator/gateway/ClaimManager.
export {
  TaskRunner,
  classifyCheckExecutionFailure,
  recoverFindingsCount,
  explicitFindingsCount,
} from './maintenance/task-runner';
export type {
  TaskRunnerOptions,
  CheckCommandRunner,
  CheckCommandResult,
  AgentDispatcher,
  AgentDispatchResult,
  CommandExecutor,
  CommandExecResult,
  PRLifecycleManager,
  CheckFailureKind,
  CheckFailureClassification,
} from './maintenance/task-runner';
export type { RunResult } from './maintenance/types';
// Real maintenance agent dispatcher (#679). Exported so the on-demand CLI
// (`harness maintenance run --fix`) can build the SAME real dispatcher the cron
// orchestrator uses (createMaintenanceTaskRunner) instead of a local stub —
// resolving backends from the CLI's loaded config and degrading gracefully when
// no backend is configured.
export { createAgentDispatcher } from './maintenance/agent-dispatcher';
export type { AgentDispatcherDeps } from './maintenance/agent-dispatcher';
export { MaintenanceReporter } from './maintenance/reporter';
export type { MaintenanceReporterOptions } from './maintenance/reporter';
export { CheckScriptRunner } from './maintenance/check-script-runner';

// Shared maintenance check-runner core. The on-demand CLI (`harness maintenance
// run`) consumes `runHarnessCheck` (plus the timeout/maxBuffer constants) so it
// shares ONE spawn/parse/timeout/executionFailed implementation with the cron
// orchestrator — they differ only in how each resolves a checkCommand into a
// spawn invocation.
export {
  runHarnessCheck,
  isCheckTimeoutError,
  MAINTENANCE_CHECK_MAX_BUFFER,
  MAINTENANCE_CHECK_TIMEOUT_MS,
} from './maintenance/check-runner';
export type {
  HarnessSpawn,
  ExecFileError,
  ExecFileAsyncFn,
  RunHarnessCheckOptions,
} from './maintenance/check-runner';

// Hermes Phase 0 / Phase 1: re-export TokenStore so the CLI (`harness gateway token`)
// and the dashboard tokens router can construct it via the package root without
// reaching into the `./auth` subpath (decision phase1-d4).
export { TokenStore } from './auth';
export type { CreateTokenInput, CreateTokenResult } from './auth';

// Hermes Phase 0 / Phase 4: expose WebhookQueue so the CLI (`harness gateway
// deliveries`) can open the SQLite file directly without depending on the
// orchestrator being running. MAX_ATTEMPTS is re-exported so test fixtures
// can drive markFailed past the dead-letter threshold without re-deriving
// the constant.
export { WebhookQueue, MAX_ATTEMPTS, RETRY_DELAYS_MS } from './gateway/webhooks/queue';
export type { QueueStats, QueueRow, QueueInsertInput } from './gateway/webhooks/queue';

// Session search + summarization + archive hooks.
export {
  SqliteSearchIndex,
  openSearchIndex,
  searchIndexPath,
  normalizeFts5Query,
  indexSessionDirectory,
  reindexFromArchive,
} from './sessions/search-index';
export type { IndexedDoc, SearchOptions } from './sessions/search-index';

export {
  summarizeArchivedSession,
  renderLlmSummaryMarkdown,
  truncateForBudget,
  isSummaryEnabled,
} from './sessions/summarize';
export type { SummarizeContext, SummarizeResult } from './sessions/summarize';

export { buildArchiveHooks } from './sessions/archive-hooks';
export type { BuildArchiveHooksOptions } from './sessions/archive-hooks';

// Notification sinks (envelope wrapper, Slack adapter, in-process dispatcher).
// The CLI's `harness notifications test` and the integration tests reach for
// these directly; everything else is wired by the orchestrator boot.
export {
  wrapAsEnvelope,
  SlackSink,
  SinkRegistry,
  SinkConfigError,
  wireNotificationSinks,
} from './notifications';
export type {
  NotificationSink,
  NotificationSinkDeliverInput,
  RegistryEntry,
  FromConfigOptions,
  SlackSinkOptions,
} from './notifications';

// Phase 4 skill-proposal pipeline (gate + promote + lifecycle emitters).
// The HTTP routes wire these into the v1 bridge; CLI and tests reach for
// them via this barrel.
export {
  runGate,
  promote,
  GateRunError,
  GateNotReadyError,
  PromotionError,
  emitProposalCreated,
  emitProposalApproved,
  emitProposalRejected,
} from './proposals';
export type {
  GateResult,
  PromotionResult,
  ProposalCreatedData,
  ProposalApprovedData,
  ProposalRejectedData,
} from './proposals';

// LMLM live candidate discovery — re-exported so the CLI composition root can
// wire the real implementation into the Orchestrator (which defaults to a no-op
// so tests make no HuggingFace calls on startup).
export { discoverCandidates } from '@harness-engineering/local-models';

// LMLM pool state — re-exported so a one-shot CLI path (e.g. roadmap triage) can
// read the persisted pool snapshot and derive its preferred local model the same
// way the live LocalModelResolver does, WITHOUT taking a direct CLI→local-models
// package edge (CLI already depends on orchestrator). The pool is the PREFERRED
// source when populated; the static `agent.backends.*.model` list remains the
// documented fallback for pool-less adopters and non-Ollama backends.
export {
  PoolStateStore,
  poolStateToCandidates,
  DEFAULT_POOL_STATE_PATH,
} from '@harness-engineering/local-models';
export type { PoolState, PoolStateProvider, RankProfile } from '@harness-engineering/local-models';
