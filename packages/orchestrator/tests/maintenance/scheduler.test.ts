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
        claimAndVerify: vi
          .fn()
          .mockResolvedValue({ ok: false, error: { message: 'network error' } }),
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
            [
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
            ].map((id) => [id, { enabled: false }])
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
});
