import { describe, it, expect, vi } from 'vitest';
import {
  registerTriageTask,
  runTriageIfLeader,
  TRIAGE_TASK_ID,
} from '../../src/maintenance/triage-task';
import { MaintenanceScheduler } from '../../src/maintenance/scheduler';
import type { RoadmapAutoTriageConfig, MaintenanceConfig } from '@harness-engineering/types';
import type { LeaderElector } from '../../src/maintenance/leader-elector';

function elector(value: 'claimed' | 'rejected', ok = true): LeaderElector {
  return {
    electLeader: vi
      .fn()
      .mockResolvedValue(ok ? { ok: true, value } : { ok: false, error: new Error('x') }),
  } as unknown as LeaderElector;
}

const enabledConfig = (schedule?: string): RoadmapAutoTriageConfig => ({
  enabled: true,
  ...(schedule !== undefined ? { schedule } : {}),
  ratchetStage: 1,
  thresholds: {
    dispatchConfidence: 'medium',
    boundedScopeMax: 10,
    brainstormConfidence: 0.7,
    exceededByBands: 1,
    ratchetAdvanceRate: 0.9,
    ratchetMinSample: 5,
  },
  depthBudget: { trivial: 1, simple: 2 },
});

describe('registerTriageTask — dormant by default (SC-S1)', () => {
  const noop = async (): Promise<void> => {};

  it('returns null when config is absent (feature off)', () => {
    expect(registerTriageTask(undefined, noop)).toBeNull();
  });

  it('returns null when enabled is false (the default master switch)', () => {
    expect(registerTriageTask({ ...enabledConfig('0 2 * * *'), enabled: false }, noop)).toBeNull();
  });

  it('returns null when enabled but no schedule (on-demand only, nothing scheduled)', () => {
    expect(registerTriageTask(enabledConfig(undefined), noop)).toBeNull();
  });

  it('registers a report-only, leader-gated task when enabled AND scheduled', () => {
    const reg = registerTriageTask(enabledConfig('0 2 * * *'), noop);
    expect(reg).not.toBeNull();
    expect(reg!.task.id).toBe(TRIAGE_TASK_ID);
    expect(reg!.task.type).toBe('report-only');
    expect(reg!.task.schedule).toBe('0 2 * * *');
    expect(reg!.task.branch).toBeNull();
    expect(reg!.task.checkCommand).toBeUndefined(); // work is the injected body, not a CLI check
    expect(reg!.body).toBe(noop);
  });
});

describe('runTriageIfLeader — single-leader guarantee (no double-run)', () => {
  it('runs the injected body exactly once when leadership is claimed', async () => {
    const body = vi.fn().mockResolvedValue(undefined);
    const ran = await runTriageIfLeader(elector('claimed'), body);
    expect(ran).toBe(true);
    expect(body).toHaveBeenCalledTimes(1);
  });

  it('does NOT run the body when leadership is rejected (a peer is leader)', async () => {
    const body = vi.fn().mockResolvedValue(undefined);
    const ran = await runTriageIfLeader(elector('rejected'), body);
    expect(ran).toBe(false);
    expect(body).not.toHaveBeenCalled();
  });

  it('does NOT run the body when the election fails (fails safe, never throws)', async () => {
    const body = vi.fn().mockResolvedValue(undefined);
    const ran = await runTriageIfLeader(elector('rejected', false), body);
    expect(ran).toBe(false);
    expect(body).not.toHaveBeenCalled();
  });
});

describe('scheduler integration — inherits maintenance leader-gating', () => {
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  const baseConfig: MaintenanceConfig = { enabled: true };

  it('does not fire the triage task when the scheduler is not the leader', async () => {
    const reg = registerTriageTask(enabledConfig('* * * * *'), async () => {})!;
    const onTaskDue = vi.fn().mockResolvedValue(undefined);
    const scheduler = new MaintenanceScheduler({
      config: {
        ...baseConfig,
        customTasks: {
          [reg.task.id]: {
            type: reg.task.type,
            description: reg.task.description,
            schedule: reg.task.schedule,
            branch: reg.task.branch,
            excludeFromHumanSweep: reg.task.excludeFromHumanSweep,
          },
        },
      },
      leaderElector: elector('rejected') as never,
      logger: logger as never,
      onTaskDue,
    });
    await scheduler.evaluate(new Date());
    expect(onTaskDue).not.toHaveBeenCalled();
  });

  it('fires the every-minute triage task only for the leader', async () => {
    const reg = registerTriageTask(enabledConfig('* * * * *'), async () => {})!;
    const fired: string[] = [];
    const scheduler = new MaintenanceScheduler({
      config: {
        ...baseConfig,
        customTasks: {
          [reg.task.id]: {
            type: reg.task.type,
            description: reg.task.description,
            schedule: reg.task.schedule,
            branch: reg.task.branch,
            excludeFromHumanSweep: reg.task.excludeFromHumanSweep,
          },
        },
      },
      leaderElector: elector('claimed') as never,
      logger: logger as never,
      onTaskDue: async (task) => {
        fired.push(task.id);
      },
    });
    await scheduler.evaluate(new Date());
    expect(fired).toContain(TRIAGE_TASK_ID);
  });
});
