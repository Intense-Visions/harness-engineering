import { describe, it, expect } from 'vitest';
import type {
  TaskType,
  TaskDefinition,
  RunResult,
  MaintenanceStatus,
  ScheduleEntry,
} from '../../src/maintenance/types';

describe('maintenance internal types', () => {
  it('TaskType accepts all four valid values', () => {
    const types: TaskType[] = ['mechanical-ai', 'pure-ai', 'report-only', 'housekeeping'];
    expect(types).toHaveLength(4);
  });

  it('TaskDefinition can be constructed with required fields', () => {
    const task: TaskDefinition = {
      id: 'test-task',
      type: 'mechanical-ai',
      description: 'A test task',
      schedule: '0 2 * * *',
      branch: 'harness-maint/test',
      checkCommand: ['check-arch'],
      fixSkill: 'harness-arch-fix',
    };
    expect(task.id).toBe('test-task');
    expect(task.type).toBe('mechanical-ai');
    expect(task.branch).toBe('harness-maint/test');
  });

  it('TaskDefinition allows null branch for report-only tasks', () => {
    const task: TaskDefinition = {
      id: 'report-task',
      type: 'report-only',
      description: 'A report task',
      schedule: '0 6 * * 1',
      branch: null,
      checkCommand: ['check-perf'],
    };
    expect(task.branch).toBeNull();
  });

  it('RunResult can represent a successful run with PR', () => {
    const result: RunResult = {
      taskId: 'arch-violations',
      startedAt: '2026-04-17T02:00:00Z',
      completedAt: '2026-04-17T02:05:00Z',
      status: 'success',
      findings: 3,
      fixed: 2,
      prUrl: 'https://github.com/org/repo/pull/42',
      prUpdated: false,
    };
    expect(result.status).toBe('success');
    expect(result.prUrl).not.toBeNull();
  });

  it('RunResult can represent a no-issues run', () => {
    const result: RunResult = {
      taskId: 'arch-violations',
      startedAt: '2026-04-17T02:00:00Z',
      completedAt: '2026-04-17T02:01:00Z',
      status: 'no-issues',
      findings: 0,
      fixed: 0,
      prUrl: null,
      prUpdated: false,
    };
    expect(result.status).toBe('no-issues');
    expect(result.findings).toBe(0);
  });

  it('RunResult can represent a failure with error', () => {
    const result: RunResult = {
      taskId: 'entropy',
      startedAt: '2026-04-17T03:00:00Z',
      completedAt: '2026-04-17T03:00:05Z',
      status: 'failure',
      findings: 0,
      fixed: 0,
      prUrl: null,
      prUpdated: false,
      error: 'Command exited with code 1',
    };
    expect(result.status).toBe('failure');
    expect(result.error).toBeDefined();
  });

  it('MaintenanceStatus represents idle state', () => {
    const status: MaintenanceStatus = {
      isLeader: true,
      lastLeaderClaim: '2026-04-17T02:00:00Z',
      schedule: [],
      activeRun: null,
      history: [],
    };
    expect(status.isLeader).toBe(true);
    expect(status.activeRun).toBeNull();
  });

  it('ScheduleEntry links a task to its next run and last result', () => {
    const entry: ScheduleEntry = {
      taskId: 'arch-violations',
      nextRun: '2026-04-18T02:00:00Z',
      lastRun: {
        taskId: 'arch-violations',
        startedAt: '2026-04-17T02:00:00Z',
        completedAt: '2026-04-17T02:05:00Z',
        status: 'success',
        findings: 3,
        fixed: 2,
        prUrl: 'https://github.com/org/repo/pull/42',
        prUpdated: true,
      },
    };
    expect(entry.taskId).toBe('arch-violations');
    expect(entry.lastRun?.status).toBe('success');
  });
});
