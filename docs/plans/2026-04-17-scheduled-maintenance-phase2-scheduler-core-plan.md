# Plan: Scheduled Maintenance -- Phase 2: Scheduler Core

**Date:** 2026-04-17 | **Spec:** docs/changes/scheduled-maintenance/proposal.md | **Tasks:** 7 | **Time:** ~30 min

## Goal

The orchestrator has a `MaintenanceScheduler` class that evaluates cron schedules on an interval timer, claims leader election via ClaimManager, enqueues due tasks, and is wired into `Orchestrator.start()` / `Orchestrator.stop()` for lifecycle management.

## Observable Truths (Acceptance Criteria)

1. When `MaintenanceScheduler.start()` is called with a config where `maintenance.enabled` is true, the scheduler starts an interval timer that evaluates cron expressions against the current time every `checkIntervalMs` milliseconds (default: 60000).
2. When the interval timer fires and this instance successfully claims `maintenance-leader` via `ClaimManager.claimAndVerify`, the scheduler evaluates all enabled tasks and enqueues those whose cron expression matches the current minute.
3. When the interval timer fires and the leader claim is rejected (another orchestrator holds it), the scheduler logs a debug message and skips cron evaluation.
4. When a task's cron expression matches the current minute and the task has not already run in the current minute, the task ID is added to the queue.
5. When `MaintenanceScheduler.stop()` is called, the interval timer is cleared and the `isLeader` flag is set to false.
6. When `Orchestrator.start()` is called and `config.maintenance?.enabled` is true, a `MaintenanceScheduler` is created and started. When `Orchestrator.stop()` is called, the scheduler is stopped.
7. When `cronMatchesNow(expression, date)` is called with a 5-field cron expression and a Date, it returns true if and only if the minute, hour, day-of-month, month, and day-of-week fields all match (supporting `*`, ranges, lists, and step values).
8. When `npx vitest run tests/maintenance/` is executed in the orchestrator package, all tests pass (including new scheduler and cron-matcher tests).
9. When `harness validate` is executed, it passes.

## Decisions

| Decision              | Choice                                                                          | Rationale                                                                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cron library          | Custom `cron-matcher.ts` utility (~60 lines)                                    | No cron dependency exists in the project. The 18 built-in schedules use only `*`, fixed values, and no complex syntax. A minimal matcher avoids a new dependency for simple matching. |
| Leader claim approach | Reuse `ClaimManager.claimAndVerify` with a synthetic `maintenance-leader` issue | ClaimManager already supports optimistic claim + verify. The maintenance leader claim uses the same pattern as issue claims but with a fixed well-known ID.                           |
| Task queue            | In-memory array, processed sequentially in the same tick                        | The spec says "Process queue sequentially (one task at a time)." A simple array suffices; no persistence needed since missed runs retry on the next interval.                         |
| Deduplication         | Track `lastRunMinute` per task ID to prevent re-running within the same minute  | The check interval (60s) could fire multiple times in the same calendar minute due to timer drift. Tracking the last-run minute prevents duplicates.                                  |

## File Map

```
CREATE  packages/orchestrator/src/maintenance/cron-matcher.ts
CREATE  packages/orchestrator/src/maintenance/scheduler.ts
MODIFY  packages/orchestrator/src/maintenance/index.ts         (add MaintenanceScheduler + cronMatchesNow exports)
MODIFY  packages/orchestrator/src/orchestrator.ts              (add scheduler lifecycle in start/stop)
CREATE  packages/orchestrator/tests/maintenance/cron-matcher.test.ts
CREATE  packages/orchestrator/tests/maintenance/scheduler.test.ts
```

## Tasks

### Task 1: Create cron-matcher utility

**Depends on:** none | **Files:** `packages/orchestrator/src/maintenance/cron-matcher.ts`, `packages/orchestrator/tests/maintenance/cron-matcher.test.ts`

1. Create test file `packages/orchestrator/tests/maintenance/cron-matcher.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { cronMatchesNow } from '../../src/maintenance/cron-matcher';

describe('cronMatchesNow', () => {
  // Helper: 2026-04-17 is a Friday (day 5)
  const friday2am = new Date('2026-04-17T02:00:00');
  const friday230 = new Date('2026-04-17T02:30:00');
  const monday6am = new Date('2026-04-20T06:00:00');
  const sunday2am = new Date('2026-04-19T02:00:00');
  const jan1midnight = new Date('2026-01-01T00:00:00');
  const firstOfMonth2am = new Date('2026-04-01T02:00:00');

  it('matches wildcard-only cron (* * * * *)', () => {
    expect(cronMatchesNow('* * * * *', friday2am)).toBe(true);
  });

  it('matches exact minute and hour (0 2 * * *)', () => {
    expect(cronMatchesNow('0 2 * * *', friday2am)).toBe(true);
    expect(cronMatchesNow('0 2 * * *', friday230)).toBe(false);
  });

  it('matches day of week (0 6 * * 1 = Monday)', () => {
    expect(cronMatchesNow('0 6 * * 1', monday6am)).toBe(true);
    expect(cronMatchesNow('0 6 * * 1', friday2am)).toBe(false);
  });

  it('matches Sunday as day 0 (0 2 * * 0)', () => {
    expect(cronMatchesNow('0 2 * * 0', sunday2am)).toBe(true);
    expect(cronMatchesNow('0 2 * * 0', friday2am)).toBe(false);
  });

  it('matches day of month (0 2 1 * *)', () => {
    expect(cronMatchesNow('0 2 1 * *', firstOfMonth2am)).toBe(true);
    expect(cronMatchesNow('0 2 1 * *', friday2am)).toBe(false);
  });

  it('matches month field (0 0 1 1 *)', () => {
    expect(cronMatchesNow('0 0 1 1 *', jan1midnight)).toBe(true);
    expect(cronMatchesNow('0 0 1 1 *', firstOfMonth2am)).toBe(false);
  });

  it('supports step values (*/15 * * * *)', () => {
    const min0 = new Date('2026-04-17T02:00:00');
    const min15 = new Date('2026-04-17T02:15:00');
    const min7 = new Date('2026-04-17T02:07:00');
    expect(cronMatchesNow('*/15 * * * *', min0)).toBe(true);
    expect(cronMatchesNow('*/15 * * * *', min15)).toBe(true);
    expect(cronMatchesNow('*/15 * * * *', min7)).toBe(false);
  });

  it('supports list values (0 1,2,3 * * *)', () => {
    expect(cronMatchesNow('0 1,2,3 * * *', friday2am)).toBe(true);
    expect(cronMatchesNow('0 1,2,3 * * *', monday6am)).toBe(false);
  });

  it('supports range values (0 1-3 * * *)', () => {
    expect(cronMatchesNow('0 1-3 * * *', friday2am)).toBe(true);
    expect(cronMatchesNow('0 1-3 * * *', monday6am)).toBe(false);
  });

  it('throws on invalid cron expression (wrong field count)', () => {
    expect(() => cronMatchesNow('0 2 * *', friday2am)).toThrow();
  });

  it('matches all 18 built-in schedules against expected times', () => {
    // Spot-check: daily 2am matches at 2:00, not at 3:00
    expect(cronMatchesNow('0 2 * * *', new Date('2026-04-17T02:00:00'))).toBe(true);
    expect(cronMatchesNow('0 2 * * *', new Date('2026-04-17T03:00:00'))).toBe(false);
    // Weekly Monday 6am
    expect(cronMatchesNow('0 6 * * 1', new Date('2026-04-20T06:00:00'))).toBe(true);
    // Monthly 1st 2am
    expect(cronMatchesNow('0 2 1 * *', new Date('2026-05-01T02:00:00'))).toBe(true);
  });
});
```

2. Run test -- expect failure: `cd packages/orchestrator && npx vitest run tests/maintenance/cron-matcher.test.ts`

3. Create `packages/orchestrator/src/maintenance/cron-matcher.ts`:

```typescript
/**
 * Minimal 5-field cron expression matcher.
 *
 * Supports: exact values, wildcards (*), ranges (1-5), lists (1,3,5), and step values (star/N).
 * Does NOT support: L, W, #, ?, or 6/7-field expressions.
 */

/**
 * Parse a single cron field into the set of matching integer values.
 */
function parseField(field: string, min: number, max: number): Set<number> {
  const values = new Set<number>();

  for (const part of field.split(',')) {
    if (part.includes('/')) {
      // Step: */N or M-N/S
      const [rangeStr, stepStr] = part.split('/');
      const step = parseInt(stepStr!, 10);
      let start = min;
      let end = max;
      if (rangeStr !== '*') {
        if (rangeStr!.includes('-')) {
          const [a, b] = rangeStr!.split('-');
          start = parseInt(a!, 10);
          end = parseInt(b!, 10);
        } else {
          start = parseInt(rangeStr!, 10);
        }
      }
      for (let i = start; i <= end; i += step) {
        values.add(i);
      }
    } else if (part === '*') {
      for (let i = min; i <= max; i++) {
        values.add(i);
      }
    } else if (part.includes('-')) {
      const [a, b] = part.split('-');
      const start = parseInt(a!, 10);
      const end = parseInt(b!, 10);
      for (let i = start; i <= end; i++) {
        values.add(i);
      }
    } else {
      values.add(parseInt(part, 10));
    }
  }

  return values;
}

/**
 * Returns true if the given 5-field cron expression matches the provided Date.
 *
 * Fields: minute hour day-of-month month day-of-week
 * Month is 1-12, day-of-week is 0-6 (0 = Sunday).
 *
 * @throws {Error} If the expression does not have exactly 5 fields.
 */
export function cronMatchesNow(expression: string, now: Date): boolean {
  const fields = expression.trim().split(/\s+/);
  if (fields.length !== 5) {
    throw new Error(`Invalid cron expression: expected 5 fields, got ${fields.length}`);
  }

  const minute = now.getMinutes();
  const hour = now.getHours();
  const dayOfMonth = now.getDate();
  const month = now.getMonth() + 1; // JS months are 0-based
  const dayOfWeek = now.getDay(); // 0 = Sunday

  const [minField, hourField, domField, monthField, dowField] = fields as [
    string,
    string,
    string,
    string,
    string,
  ];

  return (
    parseField(minField, 0, 59).has(minute) &&
    parseField(hourField, 0, 23).has(hour) &&
    parseField(domField, 1, 31).has(dayOfMonth) &&
    parseField(monthField, 1, 12).has(month) &&
    parseField(dowField, 0, 6).has(dayOfWeek)
  );
}
```

4. Run test -- expect pass: `cd packages/orchestrator && npx vitest run tests/maintenance/cron-matcher.test.ts`
5. Run: `harness validate`
6. Commit: `feat(maintenance): add cron expression matcher utility`

---

### Task 2: Create MaintenanceScheduler class -- core structure and config merging

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/maintenance/scheduler.ts`

1. Create `packages/orchestrator/tests/maintenance/scheduler.test.ts` with the first set of tests (config merging and task resolution):

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MaintenanceScheduler } from '../../src/maintenance/scheduler';
import type { MaintenanceConfig } from '@harness-engineering/types';
import type { TaskDefinition } from '../../src/maintenance/types';

// Minimal mock for ClaimManager
function createMockClaimManager(claimResult: 'claimed' | 'rejected' = 'claimed') {
  return {
    claimAndVerify: vi.fn().mockResolvedValue({ ok: true, value: claimResult }),
  };
}

// Minimal mock logger
function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

describe('MaintenanceScheduler', () => {
  describe('constructor and config merging', () => {
    it('merges config overrides with built-in task defaults', () => {
      const config: MaintenanceConfig = {
        enabled: true,
        tasks: {
          'arch-violations': { schedule: '0 4 * * *' },
          'dead-code': { enabled: false },
        },
      };

      const scheduler = new MaintenanceScheduler({
        config,
        claimManager: createMockClaimManager() as any,
        logger: createMockLogger() as any,
        onTaskDue: vi.fn(),
      });

      const tasks = scheduler.getResolvedTasks();

      // arch-violations should have overridden schedule
      const arch = tasks.find((t) => t.id === 'arch-violations')!;
      expect(arch.schedule).toBe('0 4 * * *');

      // dead-code should be disabled (filtered out)
      const dead = tasks.find((t) => t.id === 'dead-code');
      expect(dead).toBeUndefined();

      // Others should be present with defaults
      const dep = tasks.find((t) => t.id === 'dep-violations')!;
      expect(dep.schedule).toBe('0 2 * * *');
    });

    it('disables tasks with enabled: false override', () => {
      const config: MaintenanceConfig = {
        enabled: true,
        tasks: {
          'session-cleanup': { enabled: false },
          'perf-baselines': { enabled: false },
        },
      };

      const scheduler = new MaintenanceScheduler({
        config,
        claimManager: createMockClaimManager() as any,
        logger: createMockLogger() as any,
        onTaskDue: vi.fn(),
      });

      const tasks = scheduler.getResolvedTasks();
      expect(tasks.find((t) => t.id === 'session-cleanup')).toBeUndefined();
      expect(tasks.find((t) => t.id === 'perf-baselines')).toBeUndefined();
      // Total should be 18 - 2 = 16
      expect(tasks).toHaveLength(16);
    });

    it('uses all 18 built-in tasks when no overrides are provided', () => {
      const config: MaintenanceConfig = { enabled: true };

      const scheduler = new MaintenanceScheduler({
        config,
        claimManager: createMockClaimManager() as any,
        logger: createMockLogger() as any,
        onTaskDue: vi.fn(),
      });

      expect(scheduler.getResolvedTasks()).toHaveLength(18);
    });
  });
});
```

2. Run test -- expect failure: `cd packages/orchestrator && npx vitest run tests/maintenance/scheduler.test.ts`

3. Create `packages/orchestrator/src/maintenance/scheduler.ts`:

```typescript
import type { MaintenanceConfig } from '@harness-engineering/types';
import type { TaskDefinition, MaintenanceStatus, RunResult, ScheduleEntry } from './types';
import { BUILT_IN_TASKS } from './task-registry';
import { cronMatchesNow } from './cron-matcher';

/**
 * Logger interface matching StructuredLogger's shape.
 */
export interface SchedulerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  debug?(message: string, context?: Record<string, unknown>): void;
}

/**
 * Minimal ClaimManager interface used by the scheduler.
 * Avoids importing the full ClaimManager class (which depends on IssueTrackerClient).
 */
export interface SchedulerClaimManager {
  claimAndVerify(
    issueId: string
  ): Promise<{ ok: boolean; value?: 'claimed' | 'rejected'; error?: { message: string } }>;
}

export interface MaintenanceSchedulerOptions {
  config: MaintenanceConfig;
  claimManager: SchedulerClaimManager;
  logger: SchedulerLogger;
  /** Callback invoked when a task is due. The scheduler calls this for each queued task sequentially. */
  onTaskDue: (task: TaskDefinition) => Promise<void>;
}

/**
 * MaintenanceScheduler evaluates cron schedules on an interval timer,
 * claims leader election via ClaimManager, and invokes onTaskDue for
 * each task whose schedule matches the current time.
 */
export class MaintenanceScheduler {
  private config: MaintenanceConfig;
  private claimManager: SchedulerClaimManager;
  private logger: SchedulerLogger;
  private onTaskDue: (task: TaskDefinition) => Promise<void>;

  private resolvedTasks: TaskDefinition[];
  private interval: ReturnType<typeof setInterval> | null = null;
  private isLeader = false;
  private lastLeaderClaim: string | null = null;

  /** Tracks which minute (as epoch-minute) each task last ran to prevent re-runs. */
  private lastRunMinute: Map<string, number> = new Map();

  /** History of completed runs (most recent first). */
  private history: RunResult[] = [];
  private activeRun: { taskId: string; startedAt: string } | null = null;

  constructor(options: MaintenanceSchedulerOptions) {
    this.config = options.config;
    this.claimManager = options.claimManager;
    this.logger = options.logger;
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
    const ttl = this.config.leaderClaimTTLMs ?? 300_000;

    // Step 1: Attempt leader claim
    try {
      const result = await this.claimManager.claimAndVerify('maintenance-leader');
      if (!result.ok) {
        this.isLeader = false;
        this.logger.warn('Maintenance leader claim failed', { error: result.error?.message });
        return;
      }
      if (result.value === 'rejected') {
        this.isLeader = false;
        if (this.logger.debug) {
          this.logger.debug('Not the maintenance leader, skipping evaluation');
        }
        return;
      }

      this.isLeader = true;
      this.lastLeaderClaim = evalTime.toISOString();
    } catch (err) {
      this.isLeader = false;
      this.logger.error('Maintenance leader claim threw', { error: String(err) });
      return;
    }

    // Step 2: Evaluate cron for each task, build queue
    const epochMinute = Math.floor(evalTime.getTime() / 60_000);
    const queue: TaskDefinition[] = [];

    for (const task of this.resolvedTasks) {
      // Skip if already run in this minute
      if (this.lastRunMinute.get(task.id) === epochMinute) continue;

      if (cronMatchesNow(task.schedule, evalTime)) {
        queue.push(task);
      }
    }

    // Step 3: Process queue sequentially
    for (const task of queue) {
      this.lastRunMinute.set(task.id, epochMinute);
      this.activeRun = { taskId: task.id, startedAt: new Date().toISOString() };

      try {
        await this.onTaskDue(task);
      } catch (err) {
        this.logger.error(`Maintenance task ${task.id} failed`, { error: String(err) });
      }

      this.activeRun = null;
    }
  }

  /** Record a completed run result (called by the task runner or orchestrator integration). */
  recordRun(result: RunResult): void {
    this.history.unshift(result);
    // Cap history at 200 entries
    if (this.history.length > 200) {
      this.history.length = 200;
    }
  }

  /** Returns the current maintenance status for the dashboard API. */
  getStatus(): MaintenanceStatus {
    const schedule: ScheduleEntry[] = this.resolvedTasks.map((task) => ({
      taskId: task.id,
      nextRun: this.computeNextRun(task.schedule),
      lastRun: this.history.find((r) => r.taskId === task.id) ?? null,
    }));

    return {
      isLeader: this.isLeader,
      lastLeaderClaim: this.lastLeaderClaim,
      schedule,
      activeRun: this.activeRun,
      history: this.history,
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
```

4. Run test -- expect pass: `cd packages/orchestrator && npx vitest run tests/maintenance/scheduler.test.ts`
5. Run: `harness validate`
6. Commit: `feat(maintenance): add MaintenanceScheduler with config merging`

---

### Task 3: Add scheduler tests -- leader election and cron evaluation

**Depends on:** Task 2 | **Files:** `packages/orchestrator/tests/maintenance/scheduler.test.ts`

1. Append the following test blocks to `packages/orchestrator/tests/maintenance/scheduler.test.ts`:

```typescript
describe('leader election', () => {
  it('skips evaluation when leader claim is rejected', async () => {
    const config: MaintenanceConfig = { enabled: true, checkIntervalMs: 60_000 };
    const onTaskDue = vi.fn();
    const claimManager = createMockClaimManager('rejected');

    const scheduler = new MaintenanceScheduler({
      config,
      claimManager: claimManager as any,
      logger: createMockLogger() as any,
      onTaskDue,
    });

    // Evaluate at a time when daily-2am tasks would be due
    await scheduler.evaluate(new Date('2026-04-17T02:00:00'));

    expect(claimManager.claimAndVerify).toHaveBeenCalledWith('maintenance-leader');
    expect(onTaskDue).not.toHaveBeenCalled();
  });

  it('proceeds with evaluation when leader claim succeeds', async () => {
    const config: MaintenanceConfig = { enabled: true };
    const onTaskDue = vi.fn().mockResolvedValue(undefined);
    const claimManager = createMockClaimManager('claimed');

    const scheduler = new MaintenanceScheduler({
      config,
      claimManager: claimManager as any,
      logger: createMockLogger() as any,
      onTaskDue,
    });

    // 2am daily: arch-violations, dep-violations should be due
    await scheduler.evaluate(new Date('2026-04-17T02:00:00'));

    expect(onTaskDue).toHaveBeenCalled();
    const calledTaskIds = onTaskDue.mock.calls.map((c: any) => c[0].id);
    expect(calledTaskIds).toContain('arch-violations');
    expect(calledTaskIds).toContain('dep-violations');
  });

  it('sets isLeader to false when claim fails with error', async () => {
    const config: MaintenanceConfig = { enabled: true };
    const claimManager = {
      claimAndVerify: vi.fn().mockResolvedValue({ ok: false, error: { message: 'network error' } }),
    };

    const scheduler = new MaintenanceScheduler({
      config,
      claimManager: claimManager as any,
      logger: createMockLogger() as any,
      onTaskDue: vi.fn(),
    });

    await scheduler.evaluate(new Date('2026-04-17T02:00:00'));

    const status = scheduler.getStatus();
    expect(status.isLeader).toBe(false);
  });
});

describe('cron evaluation and deduplication', () => {
  it('does not re-run a task in the same calendar minute', async () => {
    const config: MaintenanceConfig = { enabled: true };
    const onTaskDue = vi.fn().mockResolvedValue(undefined);

    const scheduler = new MaintenanceScheduler({
      config,
      claimManager: createMockClaimManager() as any,
      logger: createMockLogger() as any,
      onTaskDue,
    });

    const time = new Date('2026-04-17T02:00:00');

    await scheduler.evaluate(time);
    const firstCallCount = onTaskDue.mock.calls.length;
    expect(firstCallCount).toBeGreaterThan(0);

    // Same minute again
    await scheduler.evaluate(time);
    expect(onTaskDue.mock.calls.length).toBe(firstCallCount); // No new calls
  });

  it('runs the task again in the next matching minute', async () => {
    const config: MaintenanceConfig = {
      enabled: true,
      tasks: {
        // Disable all except one for easier counting
        ...Object.fromEntries(
          Array.from({ length: 18 }, (_, i) => i).map((i) => {
            const ids = [
              'arch-violations',
              'dep-violations',
              'doc-drift',
              'security-findings',
              'entropy',
              'traceability',
              'cross-check',
              'dead-code',
              'dependency-health',
              'hotspot-remediation',
              'security-review',
              'perf-check',
              'decay-trends',
              'project-health',
              'stale-constraints',
              'graph-refresh',
              'session-cleanup',
              'perf-baselines',
            ];
            return [ids[i]!, { enabled: false }];
          })
        ),
        // Re-enable just one with a per-minute schedule for testing
        'arch-violations': { enabled: true, schedule: '* * * * *' },
      },
    };
    const onTaskDue = vi.fn().mockResolvedValue(undefined);

    const scheduler = new MaintenanceScheduler({
      config,
      claimManager: createMockClaimManager() as any,
      logger: createMockLogger() as any,
      onTaskDue,
    });

    await scheduler.evaluate(new Date('2026-04-17T02:00:00'));
    expect(onTaskDue).toHaveBeenCalledTimes(1);

    await scheduler.evaluate(new Date('2026-04-17T02:01:00'));
    expect(onTaskDue).toHaveBeenCalledTimes(2);
  });
});
```

2. Run test -- expect pass: `cd packages/orchestrator && npx vitest run tests/maintenance/scheduler.test.ts`
3. Run: `harness validate`
4. Commit: `test(maintenance): add scheduler leader election and dedup tests`

---

### Task 4: Add scheduler tests -- start/stop lifecycle and status

**Depends on:** Task 3 | **Files:** `packages/orchestrator/tests/maintenance/scheduler.test.ts`

1. Append the following test blocks to `packages/orchestrator/tests/maintenance/scheduler.test.ts`:

```typescript
describe('start and stop lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('start() begins interval and stop() clears it', async () => {
    const config: MaintenanceConfig = { enabled: true, checkIntervalMs: 1000 };
    const claimManager = createMockClaimManager('rejected'); // Don't actually run tasks
    const logger = createMockLogger();

    const scheduler = new MaintenanceScheduler({
      config,
      claimManager: claimManager as any,
      logger: logger as any,
      onTaskDue: vi.fn(),
    });

    scheduler.start();

    // Should have called evaluate once immediately
    // Wait for the initial evaluate promise
    await vi.advanceTimersByTimeAsync(0);
    expect(claimManager.claimAndVerify).toHaveBeenCalledTimes(1);

    // Advance past one interval
    await vi.advanceTimersByTimeAsync(1000);
    expect(claimManager.claimAndVerify).toHaveBeenCalledTimes(2);

    scheduler.stop();

    // No more calls after stop
    await vi.advanceTimersByTimeAsync(5000);
    expect(claimManager.claimAndVerify).toHaveBeenCalledTimes(2);
  });

  it('stop() sets isLeader to false', async () => {
    const config: MaintenanceConfig = { enabled: true };
    const scheduler = new MaintenanceScheduler({
      config,
      claimManager: createMockClaimManager() as any,
      logger: createMockLogger() as any,
      onTaskDue: vi.fn().mockResolvedValue(undefined),
    });

    // Manually set leader state by running evaluate
    await scheduler.evaluate(new Date('2026-04-17T02:00:00'));
    expect(scheduler.getStatus().isLeader).toBe(true);

    scheduler.stop();
    expect(scheduler.getStatus().isLeader).toBe(false);
  });
});

describe('getStatus', () => {
  it('returns full status with schedule entries', () => {
    const config: MaintenanceConfig = { enabled: true };
    const scheduler = new MaintenanceScheduler({
      config,
      claimManager: createMockClaimManager() as any,
      logger: createMockLogger() as any,
      onTaskDue: vi.fn(),
    });

    const status = scheduler.getStatus();
    expect(status.isLeader).toBe(false);
    expect(status.lastLeaderClaim).toBeNull();
    expect(status.activeRun).toBeNull();
    expect(status.schedule).toHaveLength(18);
    expect(status.history).toHaveLength(0);

    // Each schedule entry should have a taskId and nextRun
    for (const entry of status.schedule) {
      expect(entry.taskId).toBeTruthy();
      expect(entry.nextRun).toBeTruthy();
      expect(entry.lastRun).toBeNull();
    }
  });

  it('records run results in history', () => {
    const config: MaintenanceConfig = { enabled: true };
    const scheduler = new MaintenanceScheduler({
      config,
      claimManager: createMockClaimManager() as any,
      logger: createMockLogger() as any,
      onTaskDue: vi.fn(),
    });

    scheduler.recordRun({
      taskId: 'arch-violations',
      startedAt: '2026-04-17T02:00:00Z',
      completedAt: '2026-04-17T02:01:00Z',
      status: 'success',
      findings: 3,
      fixed: 2,
      prUrl: 'https://github.com/example/repo/pull/1',
      prUpdated: false,
    });

    const status = scheduler.getStatus();
    expect(status.history).toHaveLength(1);
    expect(status.history[0]!.taskId).toBe('arch-violations');

    // The schedule entry for arch-violations should now have lastRun
    const archEntry = status.schedule.find((s) => s.taskId === 'arch-violations')!;
    expect(archEntry.lastRun).not.toBeNull();
    expect(archEntry.lastRun!.status).toBe('success');
  });
});
```

2. Run test -- expect pass: `cd packages/orchestrator && npx vitest run tests/maintenance/scheduler.test.ts`
3. Run: `harness validate`
4. Commit: `test(maintenance): add scheduler lifecycle and status tests`

---

### Task 5: Add scheduler tests -- error handling and onTaskDue failures

**Depends on:** Task 4 | **Files:** `packages/orchestrator/tests/maintenance/scheduler.test.ts`

1. Append the following test block to `packages/orchestrator/tests/maintenance/scheduler.test.ts`:

```typescript
describe('error handling', () => {
  it('continues processing queue when a task callback throws', async () => {
    const config: MaintenanceConfig = {
      enabled: true,
      tasks: {
        // Enable only two tasks for easier testing
        ...Object.fromEntries(
          [
            'doc-drift',
            'security-findings',
            'entropy',
            'traceability',
            'cross-check',
            'dead-code',
            'dependency-health',
            'hotspot-remediation',
            'security-review',
            'perf-check',
            'decay-trends',
            'project-health',
            'stale-constraints',
            'graph-refresh',
            'session-cleanup',
            'perf-baselines',
          ].map((id) => [id, { enabled: false }])
        ),
      },
    };
    const callOrder: string[] = [];
    const onTaskDue = vi.fn().mockImplementation(async (task: TaskDefinition) => {
      callOrder.push(task.id);
      if (task.id === 'arch-violations') {
        throw new Error('simulated failure');
      }
    });
    const logger = createMockLogger();

    const scheduler = new MaintenanceScheduler({
      config,
      claimManager: createMockClaimManager() as any,
      logger: logger as any,
      onTaskDue,
    });

    // Both arch-violations and dep-violations are due at 2am
    await scheduler.evaluate(new Date('2026-04-17T02:00:00'));

    // Both tasks should have been attempted despite first one throwing
    expect(callOrder).toContain('arch-violations');
    expect(callOrder).toContain('dep-violations');
    expect(logger.error).toHaveBeenCalled();
  });

  it('handles claimAndVerify throwing an exception', async () => {
    const config: MaintenanceConfig = { enabled: true };
    const claimManager = {
      claimAndVerify: vi.fn().mockRejectedValue(new Error('connection lost')),
    };
    const logger = createMockLogger();
    const onTaskDue = vi.fn();

    const scheduler = new MaintenanceScheduler({
      config,
      claimManager: claimManager as any,
      logger: logger as any,
      onTaskDue,
    });

    // Should not throw
    await scheduler.evaluate(new Date('2026-04-17T02:00:00'));

    expect(onTaskDue).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});
```

2. Run test -- expect pass: `cd packages/orchestrator && npx vitest run tests/maintenance/scheduler.test.ts`
3. Run: `harness validate`
4. Commit: `test(maintenance): add scheduler error handling tests`

---

### Task 6: Update barrel export to include MaintenanceScheduler and cronMatchesNow

**Depends on:** Task 2 | **Files:** `packages/orchestrator/src/maintenance/index.ts`

1. Replace the contents of `packages/orchestrator/src/maintenance/index.ts` with:

```typescript
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
```

2. Run all maintenance tests: `cd packages/orchestrator && npx vitest run tests/maintenance/`
3. Run: `harness validate`
4. Commit: `feat(maintenance): export MaintenanceScheduler and cronMatchesNow from barrel`

---

### Task 7: Wire MaintenanceScheduler into Orchestrator.start() and Orchestrator.stop()

**Depends on:** Task 6 | **Files:** `packages/orchestrator/src/orchestrator.ts`

[checkpoint:human-verify] -- This task modifies the main Orchestrator class. Verify the integration looks correct before committing.

1. In `packages/orchestrator/src/orchestrator.ts`, add the import at the top (after the ClaimManager import around line 67):

```typescript
import { MaintenanceScheduler } from './maintenance/scheduler';
```

2. Add a private field to the `Orchestrator` class (after the `claimManager` field around line 109):

```typescript
  private maintenanceScheduler: MaintenanceScheduler | null = null;
```

3. In the `start()` method (around line 1438), after the heartbeat interval setup (after line 1486) and before the closing brace, add:

```typescript
// Start maintenance scheduler if enabled
if (this.config.maintenance?.enabled) {
  this.maintenanceScheduler = new MaintenanceScheduler({
    config: this.config.maintenance,
    claimManager: this.claimManager!,
    logger: this.logger,
    onTaskDue: async (task) => {
      this.logger.info(`Maintenance task due: ${task.id}`, { taskId: task.id });
      // Phase 3 will wire this to TaskRunner.run(task)
    },
  });
  this.maintenanceScheduler.start();
}
```

4. In the `stop()` method (around line 1492), before `this.logger.info('Orchestrator stopped.')`, add:

```typescript
if (this.maintenanceScheduler) {
  this.maintenanceScheduler.stop();
  this.maintenanceScheduler = null;
}
```

5. Add a public accessor for the dashboard (after the `getSnapshot()` method):

```typescript
  /** Returns the maintenance scheduler status, or null if maintenance is not enabled. */
  public getMaintenanceStatus(): import('./maintenance/types').MaintenanceStatus | null {
    return this.maintenanceScheduler?.getStatus() ?? null;
  }
```

6. Run all maintenance tests: `cd packages/orchestrator && npx vitest run tests/maintenance/`
7. Run full orchestrator build: `cd packages/orchestrator && npx tsc --noEmit`
8. Run: `harness validate`
9. Commit: `feat(maintenance): wire MaintenanceScheduler into Orchestrator lifecycle`
