/**
 * Scheduled maintenance module -- public exports.
 *
 * Phase 1 exports types and the task registry.
 * Phase 2 adds MaintenanceScheduler and cron matching.
 * Phase 3 adds TaskRunner with four execution paths.
 * Phase 4 adds PRManager for branch and PR lifecycle.
 * Subsequent phases add:
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

export { TaskRunner } from './task-runner';
export type {
  CheckCommandRunner,
  CheckCommandResult,
  AgentDispatcher,
  AgentDispatchResult,
  CommandExecutor,
  TaskRunnerOptions,
} from './task-runner';

export { PRManager } from './pr-manager';
export type {
  GitExecutor,
  GhExecutor,
  EnsureBranchResult,
  EnsurePRResult,
  PRManagerOptions,
  PRManagerLogger,
} from './pr-manager';
