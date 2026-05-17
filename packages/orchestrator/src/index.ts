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
export { OrchestratorBackendFactory } from './agent/orchestrator-backend-factory';
export type { OrchestratorBackendFactoryOptions } from './agent/orchestrator-backend-factory';
export { migrateAgentConfig } from './agent/config-migration';
export type { MigrationResult } from './agent/config-migration';
export { createBackend } from './agent/backend-factory';

// Phase 1 sync-main helper public surface. Wired into the maintenance
// scheduler in Phase 2; exported here so the CLI can wrap it directly.
export { syncMain } from './maintenance/sync-main';
export type { SyncMainResult, SyncMainOptions, SyncSkipReason } from './maintenance/sync-main';

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

// Hermes Phase 1 — Session search + summarization + archive hooks.
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
