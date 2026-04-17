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
