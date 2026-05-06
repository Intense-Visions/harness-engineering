import { describe, it, expect } from 'vitest';
import { BUILT_IN_TASKS } from '../../src/maintenance/task-registry';
import type { TaskDefinition, TaskType } from '../../src/maintenance/types';

describe('task-registry', () => {
  it('exports exactly 20 built-in task definitions', () => {
    expect(BUILT_IN_TASKS).toHaveLength(20);
  });

  it('every task has a unique id', () => {
    const ids = BUILT_IN_TASKS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every task has a non-empty schedule (cron expression)', () => {
    for (const task of BUILT_IN_TASKS) {
      expect(task.schedule).toBeTruthy();
      // Basic cron format: 5 space-separated fields
      expect(task.schedule.split(' ')).toHaveLength(5);
    }
  });

  it('every task has a valid type', () => {
    const validTypes: TaskType[] = ['mechanical-ai', 'pure-ai', 'report-only', 'housekeeping'];
    for (const task of BUILT_IN_TASKS) {
      expect(validTypes).toContain(task.type);
    }
  });

  it('mechanical-ai tasks have checkCommand and fixSkill', () => {
    const mechanicalAi = BUILT_IN_TASKS.filter((t) => t.type === 'mechanical-ai');
    expect(mechanicalAi.length).toBe(7);
    for (const task of mechanicalAi) {
      expect(task.checkCommand).toBeDefined();
      expect(task.checkCommand!.length).toBeGreaterThan(0);
      expect(task.fixSkill).toBeDefined();
      expect(task.branch).not.toBeNull();
    }
  });

  it('pure-ai tasks have fixSkill and branch but no checkCommand', () => {
    const pureAi = BUILT_IN_TASKS.filter((t) => t.type === 'pure-ai');
    expect(pureAi.length).toBe(4);
    for (const task of pureAi) {
      expect(task.fixSkill).toBeDefined();
      expect(task.branch).not.toBeNull();
      expect(task.checkCommand).toBeUndefined();
    }
  });

  it('report-only tasks have checkCommand and null branch', () => {
    const reportOnly = BUILT_IN_TASKS.filter((t) => t.type === 'report-only');
    expect(reportOnly.length).toBe(7);
    for (const task of reportOnly) {
      expect(task.checkCommand).toBeDefined();
      expect(task.branch).toBeNull();
      expect(task.fixSkill).toBeUndefined();
    }
  });

  it('housekeeping tasks have checkCommand and null branch', () => {
    const housekeeping = BUILT_IN_TASKS.filter((t) => t.type === 'housekeeping');
    expect(housekeeping.length).toBe(2);
    for (const task of housekeeping) {
      expect(task.checkCommand).toBeDefined();
      expect(task.branch).toBeNull();
      expect(task.fixSkill).toBeUndefined();
    }
  });

  describe('specific task IDs and schedules from spec', () => {
    const taskMap = new Map<string, TaskDefinition>();
    for (const t of BUILT_IN_TASKS) {
      taskMap.set(t.id, t);
    }

    // Mechanical-AI tasks
    it('arch-violations: daily 2am, mechanical-ai', () => {
      const t = taskMap.get('arch-violations')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 2 * * *');
      expect(t.branch).toBe('harness-maint/arch-fixes');
      expect(t.checkCommand).toEqual(['check-arch']);
    });

    it('dep-violations: daily 2am, mechanical-ai', () => {
      const t = taskMap.get('dep-violations')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 2 * * *');
      expect(t.branch).toBe('harness-maint/dep-fixes');
      expect(t.checkCommand).toEqual(['check-deps']);
    });

    it('doc-drift: daily 3am, mechanical-ai', () => {
      const t = taskMap.get('doc-drift')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 3 * * *');
      expect(t.branch).toBe('harness-maint/doc-fixes');
    });

    it('security-findings: daily 1am, mechanical-ai', () => {
      const t = taskMap.get('security-findings')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 1 * * *');
      expect(t.branch).toBe('harness-maint/security-fixes');
    });

    it('entropy: daily 3am, mechanical-ai', () => {
      const t = taskMap.get('entropy')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 3 * * *');
      expect(t.branch).toBe('harness-maint/entropy-fixes');
    });

    it('traceability: weekly Monday 6am, mechanical-ai', () => {
      const t = taskMap.get('traceability')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 6 * * 1');
      expect(t.branch).toBe('harness-maint/traceability-fixes');
    });

    it('cross-check: weekly Monday 6am, mechanical-ai', () => {
      const t = taskMap.get('cross-check')!;
      expect(t.type).toBe('mechanical-ai');
      expect(t.schedule).toBe('0 6 * * 1');
      expect(t.branch).toBe('harness-maint/cross-check-fixes');
    });

    // Pure-AI tasks
    it('dead-code: weekly Sunday 2am, pure-ai', () => {
      const t = taskMap.get('dead-code')!;
      expect(t.type).toBe('pure-ai');
      expect(t.schedule).toBe('0 2 * * 0');
      expect(t.branch).toBe('harness-maint/dead-code');
    });

    it('dependency-health: weekly Sunday 3am, pure-ai', () => {
      const t = taskMap.get('dependency-health')!;
      expect(t.type).toBe('pure-ai');
      expect(t.schedule).toBe('0 3 * * 0');
      expect(t.branch).toBe('harness-maint/dep-health');
    });

    it('hotspot-remediation: weekly Sunday 4am, pure-ai', () => {
      const t = taskMap.get('hotspot-remediation')!;
      expect(t.type).toBe('pure-ai');
      expect(t.schedule).toBe('0 4 * * 0');
      expect(t.branch).toBe('harness-maint/hotspot-fixes');
    });

    it('security-review: weekly Sunday 1am, pure-ai', () => {
      const t = taskMap.get('security-review')!;
      expect(t.type).toBe('pure-ai');
      expect(t.schedule).toBe('0 1 * * 0');
      expect(t.branch).toBe('harness-maint/security-deep');
    });

    // Report-only tasks
    it('perf-check: weekly Monday 6am, report-only', () => {
      const t = taskMap.get('perf-check')!;
      expect(t.type).toBe('report-only');
      expect(t.schedule).toBe('0 6 * * 1');
      expect(t.branch).toBeNull();
    });

    it('decay-trends: weekly Monday 7am, report-only', () => {
      const t = taskMap.get('decay-trends')!;
      expect(t.type).toBe('report-only');
      expect(t.schedule).toBe('0 7 * * 1');
    });

    it('project-health: daily 6am, report-only', () => {
      const t = taskMap.get('project-health')!;
      expect(t.type).toBe('report-only');
      expect(t.schedule).toBe('0 6 * * *');
    });

    it('stale-constraints: monthly 1st 2am, report-only', () => {
      const t = taskMap.get('stale-constraints')!;
      expect(t.type).toBe('report-only');
      expect(t.schedule).toBe('0 2 1 * *');
    });

    // Housekeeping tasks
    it('session-cleanup: daily midnight, housekeeping', () => {
      const t = taskMap.get('session-cleanup')!;
      expect(t.type).toBe('housekeeping');
      expect(t.schedule).toBe('0 0 * * *');
      expect(t.branch).toBeNull();
    });

    it('perf-baselines: daily 7am, housekeeping', () => {
      const t = taskMap.get('perf-baselines')!;
      expect(t.type).toBe('housekeeping');
      expect(t.schedule).toBe('0 7 * * *');
      expect(t.branch).toBeNull();
    });

    // graph-refresh was in the spec report-only section but not yet tested
    it('graph-refresh: daily 1am, report-only', () => {
      const t = taskMap.get('graph-refresh')!;
      expect(t.type).toBe('report-only');
      expect(t.schedule).toBe('0 1 * * *');
      expect(t.branch).toBeNull();
    });

    it('registers product-pulse as a daily report-only task', () => {
      const task = taskMap.get('product-pulse');
      expect(task).toBeDefined();
      expect(task!.type).toBe('report-only');
      expect(task!.schedule).toBe('0 8 * * *');
      expect(task!.branch).toBeNull();
      expect(task!.checkCommand).toEqual(['pulse', 'run', '--non-interactive']);
      expect(task!.fixSkill).toBeUndefined();
    });

    it('registers compound-candidates on Mondays 9am', () => {
      const task = taskMap.get('compound-candidates');
      expect(task).toBeDefined();
      expect(task!.type).toBe('report-only');
      expect(task!.schedule).toBe('0 9 * * 1');
      expect(task!.branch).toBeNull();
      expect(task!.checkCommand).toEqual(['compound', 'scan-candidates', '--non-interactive']);
    });

    it('keeps cron schedules unique enough to avoid collision with the 6am Monday block', () => {
      // traceability, cross-check, perf-check all run at '0 6 * * 1'; compound-candidates moved to 9am to leave room
      const at6amMonday = BUILT_IN_TASKS.filter((t) => t.schedule === '0 6 * * 1');
      expect(at6amMonday.map((t) => t.id).sort()).toEqual([
        'cross-check',
        'perf-check',
        'traceability',
      ]);
    });
  });
});
