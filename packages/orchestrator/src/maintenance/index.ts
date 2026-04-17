/**
 * Scheduled maintenance module -- public exports.
 *
 * Phase 1 exports types and the task registry.
 * Phase 2 adds MaintenanceScheduler and cron matching.
 * Subsequent phases add:
 * - TaskRunner (Phase 3)
 * - PRManager (Phase 4)
 * - Reporter (Phase 5)
 */

export type {
  TaskType,
  TaskDefinition,
  RunResult,
  ScheduleEntry,
  MaintenanceStatus,
} from './types';

export { BUILT_IN_TASKS } from './task-registry';

export { MaintenanceScheduler } from './scheduler';
export type {
  MaintenanceSchedulerOptions,
  SchedulerLogger,
  SchedulerClaimManager,
} from './scheduler';

export { cronMatchesNow } from './cron-matcher';
