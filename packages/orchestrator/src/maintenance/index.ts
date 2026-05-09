/**
 * Scheduled maintenance module -- public exports.
 *
 * Phase 1 exports types and the task registry.
 * Phase 2 adds MaintenanceScheduler and cron matching.
 * Phase 3 adds TaskRunner with four execution paths.
 * Phase 4 adds PRManager for branch and PR lifecycle.
 * Phase 5 adds MaintenanceReporter for run result persistence.
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
  MaintenanceLogger,
  SchedulerLogger,
  RunHistoryProvider,
} from './scheduler';

export { SingleProcessLeaderElector } from './leader-elector';
export type { LeaderElector } from './leader-elector';

export { cronMatchesNow } from './cron-matcher';

export { TaskRunner } from './task-runner';
export type {
  CheckCommandRunner,
  CheckCommandResult,
  AgentDispatcher,
  AgentDispatchResult,
  CommandExecutor,
  PRLifecycleManager,
  TaskRunnerOptions,
} from './task-runner';

export { MaintenanceReporter } from './reporter';
export type { MaintenanceReporterOptions } from './reporter';

export { PRManager } from './pr-manager';
export type {
  GitExecutor,
  GhExecutor,
  EnsureBranchResult,
  EnsurePRResult,
  PRManagerOptions,
  PRManagerLogger,
} from './pr-manager';
