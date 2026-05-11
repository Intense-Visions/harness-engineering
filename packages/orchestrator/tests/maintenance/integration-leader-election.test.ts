import { describe, it, expect, vi } from 'vitest';
import { MaintenanceScheduler } from '../../src/maintenance/scheduler';
import type { MaintenanceConfig } from '@harness-engineering/types';

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe('Integration: leader election with two schedulers', () => {
  it('only one scheduler dispatches tasks when sharing a LeaderElector', async () => {
    // LeaderElector that grants the first call and rejects the second
    let callCount = 0;
    const sharedLeaderElector = {
      electLeader: vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) return { ok: true, value: 'claimed' as const };
        return { ok: true, value: 'rejected' as const };
      }),
    };

    // Explicitly enable only arch-violations with a matching schedule.
    // All other tasks are disabled to prevent breakage when new tasks are added.
    const config: MaintenanceConfig = {
      enabled: true,
      tasks: {
        'arch-violations': { enabled: true, schedule: '0 2 * * *' },
        ...Object.fromEntries(
          [
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
            'main-sync',
          ].map((id) => [id, { enabled: false }])
        ),
      },
    };

    const onTaskDueA = vi.fn().mockResolvedValue(undefined);
    const onTaskDueB = vi.fn().mockResolvedValue(undefined);

    const schedulerA = new MaintenanceScheduler({
      config,
      leaderElector: sharedLeaderElector as any,
      logger: createMockLogger() as any,
      onTaskDue: onTaskDueA,
    });

    const schedulerB = new MaintenanceScheduler({
      config,
      leaderElector: sharedLeaderElector as any,
      logger: createMockLogger() as any,
      onTaskDue: onTaskDueB,
    });

    const time = new Date('2026-04-17T02:00:00');

    // Scheduler A evaluates first -- gets leader
    await schedulerA.evaluate(time);
    // Scheduler B evaluates second -- rejected
    await schedulerB.evaluate(time);

    expect(onTaskDueA).toHaveBeenCalledTimes(1);
    expect(onTaskDueB).not.toHaveBeenCalled();
    expect(schedulerA.getStatus().isLeader).toBe(true);
    expect(schedulerB.getStatus().isLeader).toBe(false);
  });

  it('leadership can transfer when first scheduler loses claim', async () => {
    // Sequence of claim results: A=claimed, B=rejected, A=rejected, B=claimed
    const claimResults: Array<'claimed' | 'rejected'> = [
      'claimed',
      'rejected',
      'rejected',
      'claimed',
    ];
    let callIndex = 0;
    const sharedLeaderElector = {
      electLeader: vi.fn().mockImplementation(async () => {
        const result = claimResults[callIndex] ?? 'rejected';
        callIndex++;
        return { ok: true, value: result };
      }),
    };

    const config: MaintenanceConfig = {
      enabled: true,
      tasks: {
        ...Object.fromEntries(
          [
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
            'main-sync',
          ].map((id) => [id, { enabled: false }])
        ),
        'arch-violations': { enabled: true, schedule: '* * * * *' },
      },
    };

    const onTaskDueA = vi.fn().mockResolvedValue(undefined);
    const onTaskDueB = vi.fn().mockResolvedValue(undefined);

    const schedulerA = new MaintenanceScheduler({
      config,
      leaderElector: sharedLeaderElector as any,
      logger: createMockLogger() as any,
      onTaskDue: onTaskDueA,
    });

    const schedulerB = new MaintenanceScheduler({
      config,
      leaderElector: sharedLeaderElector as any,
      logger: createMockLogger() as any,
      onTaskDue: onTaskDueB,
    });

    // Round 1: A leads (call 0=claimed), B loses (call 1=rejected)
    await schedulerA.evaluate(new Date('2026-04-17T02:00:00'));
    await schedulerB.evaluate(new Date('2026-04-17T02:00:00'));
    expect(onTaskDueA).toHaveBeenCalledTimes(1);
    expect(onTaskDueB).not.toHaveBeenCalled();

    // Round 2: A loses (call 2=rejected), B leads (call 3=claimed)
    await schedulerA.evaluate(new Date('2026-04-17T02:01:00'));
    await schedulerB.evaluate(new Date('2026-04-17T02:01:00'));
    expect(onTaskDueA).toHaveBeenCalledTimes(1); // No new calls
    expect(onTaskDueB).toHaveBeenCalledTimes(1);
    expect(schedulerB.getStatus().isLeader).toBe(true);
    expect(schedulerA.getStatus().isLeader).toBe(false);
  });
});
