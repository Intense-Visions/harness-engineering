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
