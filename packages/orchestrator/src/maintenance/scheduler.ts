import type { MaintenanceConfig } from '@harness-engineering/types';
import type { TaskDefinition, MaintenanceStatus, RunResult, ScheduleEntry } from './types';
import { BUILT_IN_TASKS } from './task-registry';
import { cronMatchesNow } from './cron-matcher';

/**
 * Unified logger interface for all maintenance classes.
 * Matches StructuredLogger's shape.
 */
export interface MaintenanceLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug?(message: string, context?: Record<string, unknown>): void;
}

/** @deprecated Use MaintenanceLogger instead */
export type SchedulerLogger = MaintenanceLogger;

/**
 * Minimal ClaimManager interface used by the scheduler.
 * Avoids importing the full ClaimManager class (which depends on IssueTrackerClient).
 */
export interface SchedulerClaimManager {
  claimAndVerify(
    issueId: string
  ): Promise<{ ok: boolean; value?: 'claimed' | 'rejected'; error?: { message: string } }>;
}

/** Interface for providing run history to the scheduler's getStatus(). */
export interface RunHistoryProvider {
  getHistory(limit: number, offset: number): RunResult[];
}

export interface MaintenanceSchedulerOptions {
  config: MaintenanceConfig;
  claimManager: SchedulerClaimManager;
  logger: MaintenanceLogger;
  /** Callback invoked when a task is due. The scheduler calls this for each queued task sequentially. */
  onTaskDue: (task: TaskDefinition) => Promise<void>;
  /** Optional history provider for getStatus(). When set, getStatus() reads history from here instead of internal state. */
  historyProvider?: RunHistoryProvider;
}

/**
 * MaintenanceScheduler evaluates cron schedules on an interval timer,
 * claims leader election via ClaimManager, and invokes onTaskDue for
 * each task whose schedule matches the current time.
 */
export class MaintenanceScheduler {
  private config: MaintenanceConfig;
  private claimManager: SchedulerClaimManager;
  private logger: MaintenanceLogger;
  private onTaskDue: (task: TaskDefinition) => Promise<void>;
  private historyProvider: RunHistoryProvider | null;

  private resolvedTasks: TaskDefinition[];
  private interval: ReturnType<typeof setInterval> | null = null;
  private isLeader = false;
  private lastLeaderClaim: string | null = null;

  /** Tracks which minute (as epoch-minute) each task last ran to prevent re-runs. */
  private lastRunMinute: Map<string, number> = new Map();

  /** Fallback history when no historyProvider is set (for backward compat in tests). */
  private internalHistory: RunResult[] = [];
  private activeRun: { taskId: string; startedAt: string } | null = null;

  constructor(options: MaintenanceSchedulerOptions) {
    this.config = options.config;
    this.claimManager = options.claimManager;
    this.logger = options.logger;
    this.historyProvider = options.historyProvider ?? null;
    this.onTaskDue = options.onTaskDue;

    this.resolvedTasks = this.resolveTasks();
  }

  /**
   * Merge built-in task definitions with config overrides.
   * Tasks with `enabled: false` are filtered out.
   * Schedule overrides replace the default cron expression.
   */
  private resolveTasks(): TaskDefinition[] {
    const overrides = this.config.tasks ?? {};

    return BUILT_IN_TASKS.filter((task) => {
      const override = overrides[task.id];
      if (override?.enabled === false) return false;
      return true;
    }).map((task) => {
      const override = overrides[task.id];
      if (!override) return { ...task };
      return {
        ...task,
        ...(override.schedule !== undefined && { schedule: override.schedule }),
      };
    });
  }

  /** Returns the resolved (merged) task list. Useful for testing and dashboard. */
  getResolvedTasks(): readonly TaskDefinition[] {
    return this.resolvedTasks;
  }

  /** Returns the onTaskDue callback for direct invocation (manual trigger). */
  getOnTaskDue(): (task: TaskDefinition) => Promise<void> {
    return this.onTaskDue;
  }

  /**
   * Start the scheduler interval timer.
   * Immediately performs the first evaluation, then repeats every checkIntervalMs.
   */
  start(): void {
    if (this.interval) return; // Already started

    const intervalMs = this.config.checkIntervalMs ?? 60_000;
    this.logger.info('MaintenanceScheduler starting', {
      intervalMs,
      taskCount: this.resolvedTasks.length,
    });

    // Run immediately, then on interval
    void this.evaluate();
    this.interval = setInterval(() => {
      void this.evaluate();
    }, intervalMs);
  }

  /** Stop the scheduler and clear the interval timer. */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isLeader = false;
    this.logger.info('MaintenanceScheduler stopped');
  }

  /**
   * Core evaluation loop. Called every checkIntervalMs.
   *
   * 1. Attempt leader claim
   * 2. If leader, evaluate cron for each task
   * 3. Process due tasks sequentially
   */
  async evaluate(now?: Date): Promise<void> {
    const evalTime = now ?? new Date();

    const isLeader = await this.attemptLeaderClaim(evalTime);
    if (!isLeader) return;

    const epochMinute = Math.floor(evalTime.getTime() / 60_000);
    const queue = this.buildQueue(evalTime, epochMinute);
    await this.processQueue(queue, epochMinute);
  }

  /**
   * Attempt to claim leadership via ClaimManager.
   * Returns true if this instance is the leader.
   */
  private async attemptLeaderClaim(evalTime: Date): Promise<boolean> {
    try {
      const result = await this.claimManager.claimAndVerify('maintenance-leader');
      if (!result.ok) {
        this.isLeader = false;
        this.logger.warn('Maintenance leader claim failed', { error: result.error?.message });
        return false;
      }
      if (result.value === 'rejected') {
        this.isLeader = false;
        if (this.logger.debug) {
          this.logger.debug('Not the maintenance leader, skipping evaluation');
        }
        return false;
      }

      this.isLeader = true;
      this.lastLeaderClaim = evalTime.toISOString();
      return true;
    } catch (err) {
      this.isLeader = false;
      this.logger.error('Maintenance leader claim threw', { error: String(err) });
      return false;
    }
  }

  /**
   * Evaluate cron for each task and return those due for execution.
   * Skips tasks that have already run in the current minute.
   */
  private buildQueue(evalTime: Date, epochMinute: number): TaskDefinition[] {
    const queue: TaskDefinition[] = [];

    for (const task of this.resolvedTasks) {
      if (this.lastRunMinute.get(task.id) === epochMinute) continue;

      if (cronMatchesNow(task.schedule, evalTime)) {
        queue.push(task);
      }
    }

    return queue;
  }

  /**
   * Process queued tasks sequentially, invoking onTaskDue for each.
   */
  private async processQueue(queue: TaskDefinition[], epochMinute: number): Promise<void> {
    for (const task of queue) {
      this.lastRunMinute.set(task.id, epochMinute);
      this.activeRun = { taskId: task.id, startedAt: new Date().toISOString() };

      const startedAt = this.activeRun.startedAt;
      try {
        await this.onTaskDue(task);
      } catch (err) {
        this.logger.error(`Maintenance task ${task.id} failed`, { error: String(err) });
        this.recordRun({
          taskId: task.id,
          startedAt,
          completedAt: new Date().toISOString(),
          status: 'failure',
          findings: 0,
          fixed: 0,
          prUrl: null,
          prUpdated: false,
          error: String(err),
        });
      }

      this.activeRun = null;
    }
  }

  /**
   * Record a completed run result.
   * Kept for backward compat (tests that don't inject historyProvider).
   * In production, the orchestrator records via the reporter directly.
   */
  recordRun(result: RunResult): void {
    this.internalHistory.unshift(result);
    if (this.internalHistory.length > 200) {
      this.internalHistory.length = 200;
    }
  }

  /** Returns the current maintenance status for the dashboard API. */
  getStatus(): MaintenanceStatus {
    // Use historyProvider (reporter) when available; fall back to internal history
    const history = this.historyProvider
      ? this.historyProvider.getHistory(200, 0)
      : this.internalHistory;

    const schedule: ScheduleEntry[] = this.resolvedTasks.map((task) => ({
      taskId: task.id,
      nextRun: this.computeNextRun(task.schedule),
      lastRun: history.find((r) => r.taskId === task.id) ?? null,
    }));

    return {
      isLeader: this.isLeader,
      lastLeaderClaim: this.lastLeaderClaim,
      schedule,
      activeRun: this.activeRun,
      history,
    };
  }

  /**
   * Compute a rough next-run ISO string for a cron expression.
   * Scans the next 1440 minutes (24 hours) to find the next match.
   */
  private computeNextRun(cronExpr: string): string {
    const now = new Date();
    // Start from the next minute
    const start = new Date(now);
    start.setSeconds(0, 0);
    start.setMinutes(start.getMinutes() + 1);

    for (let i = 0; i < 1440; i++) {
      const candidate = new Date(start.getTime() + i * 60_000);
      if (cronMatchesNow(cronExpr, candidate)) {
        return candidate.toISOString();
      }
    }

    // Fallback: scan up to 31 days for monthly schedules
    for (let i = 1440; i < 44_640; i++) {
      const candidate = new Date(start.getTime() + i * 60_000);
      if (cronMatchesNow(cronExpr, candidate)) {
        return candidate.toISOString();
      }
    }

    return 'unknown';
  }
}
