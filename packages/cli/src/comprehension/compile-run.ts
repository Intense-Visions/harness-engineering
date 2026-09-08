/**
 * The `harness comprehend` driver — promoted into `@harness-engineering/core`
 * (`comprehension/run.ts`) so library consumers drive the substrate through the
 * same IO-injected orchestration the CLI does. This module now re-exports the
 * core implementation for back-compat; every existing importer keeps working.
 */
export {
  runComprehend,
  runComprehendCheck,
  runComprehendStats,
  mapWithConcurrency,
} from '@harness-engineering/core';
export type {
  ComprehendModuleReader,
  ComprehendUnitStore,
  ComprehendRunOptions,
  ComprehendRunResult,
  ComprehendListStore,
  ComprehendCheckResult,
  ComprehendStatsResult,
} from '@harness-engineering/core';
