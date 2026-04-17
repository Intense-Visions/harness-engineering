/**
 * Scheduled maintenance module — public exports.
 *
 * Phase 1 exports types and the task registry. Subsequent phases add:
 * - MaintenanceScheduler (Phase 2)
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
