export type { MigrationPlan, MigrationOptions, MigrationReport } from './types';
export { buildMigrationPlan } from './plan-builder';
export { runMigrationPlan } from './run';
export type { RunDeps } from './run';
export {
  hashHistoryEvent,
  buildHistoryCommentBody,
  parseHashFromCommentBody,
} from './history-hash';
export { bodyMetaMatches } from './body-diff';
