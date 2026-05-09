import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { MaintenanceScheduler } from '../../src/maintenance/scheduler';
import { TaskRunner } from '../../src/maintenance/task-runner';
import { MaintenanceReporter } from '../../src/maintenance/reporter';
import type { MaintenanceConfig } from '@harness-engineering/types';
import type { TaskDefinition } from '../../src/maintenance/types';
import type {
  CheckCommandRunner,
  AgentDispatcher,
  CommandExecutor,
  PRLifecycleManager,
} from '../../src/maintenance/task-runner';

function createMockLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
}

describe('Integration: full maintenance cycle', () => {
  it('scheduler -> task runner -> PR manager -> reporter', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-integ-'));

    try {
      const config: MaintenanceConfig = {
        enabled: true,
        tasks: {
          // Disable all except arch-violations
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
            ].map((id) => [id, { enabled: false }])
          ),
        },
      };

      // Mock dependencies
      const checkRunner: CheckCommandRunner = {
        run: vi.fn().mockResolvedValue({ passed: false, findings: 4, output: '4 violations' }),
      };
      const agentDispatcher: AgentDispatcher = {
        dispatch: vi.fn().mockResolvedValue({ producedCommits: true, fixed: 3 }),
      };
      const commandExecutor: CommandExecutor = {
        exec: vi.fn().mockResolvedValue(undefined),
      };
      const prManager: PRLifecycleManager = {
        ensureBranch: vi.fn().mockResolvedValue({ created: true, recreated: false }),
        ensurePR: vi.fn().mockResolvedValue({
          prUrl: 'https://github.com/org/repo/pull/100',
          prUpdated: false,
        }),
      };

      const reporter = new MaintenanceReporter({ persistDir: tmpDir });
      await reporter.load();

      const taskRunner = new TaskRunner({
        config,
        checkRunner,
        agentDispatcher,
        commandExecutor,
        cwd: '/test/project',
        prManager,
      });

      // Wire scheduler's onTaskDue to run task and record result
      const onTaskDue = async (task: TaskDefinition) => {
        const result = await taskRunner.run(task);
        scheduler.recordRun(result);
        await reporter.record(result);
      };

      const leaderElector = {
        electLeader: vi.fn().mockResolvedValue({ ok: true, value: 'claimed' }),
      };

      const scheduler = new MaintenanceScheduler({
        config,
        leaderElector: leaderElector as any,
        logger: createMockLogger() as any,
        onTaskDue,
      });

      // Trigger evaluation at 2am when arch-violations is due
      await scheduler.evaluate(new Date('2026-04-17T02:00:00'));

      // Verify the full pipeline executed
      expect(checkRunner.run).toHaveBeenCalledWith(['check-arch'], '/test/project');
      expect(agentDispatcher.dispatch).toHaveBeenCalledWith(
        'harness-arch-fix',
        'harness-maint/arch-fixes',
        'local',
        '/test/project'
      );
      expect(prManager.ensureBranch).toHaveBeenCalledWith('harness-maint/arch-fixes', 'main');
      expect(prManager.ensurePR).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'arch-violations' }),
        expect.stringContaining('Findings: 4')
      );

      // Verify scheduler recorded the run
      const status = scheduler.getStatus();
      expect(status.history).toHaveLength(1);
      expect(status.history[0]!.taskId).toBe('arch-violations');
      expect(status.history[0]!.status).toBe('success');
      expect(status.history[0]!.findings).toBe(4);
      expect(status.history[0]!.fixed).toBe(3);
      expect(status.history[0]!.prUrl).toBe('https://github.com/org/repo/pull/100');

      // Verify reporter persisted to disk
      const reporterHistory = reporter.getHistory(100, 0);
      expect(reporterHistory).toHaveLength(1);
      expect(reporterHistory[0]!.prUrl).toBe('https://github.com/org/repo/pull/100');

      // Verify persistence on disk
      const diskData = JSON.parse(fs.readFileSync(path.join(tmpDir, 'history.json'), 'utf-8'));
      expect(diskData).toHaveLength(1);
      expect(diskData[0].taskId).toBe('arch-violations');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('full cycle with task failure records error in reporter', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'maint-integ-fail-'));

    try {
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
            ].map((id) => [id, { enabled: false }])
          ),
        },
      };

      const checkRunner: CheckCommandRunner = {
        run: vi.fn().mockRejectedValue(new Error('check binary not found')),
      };
      const agentDispatcher: AgentDispatcher = {
        dispatch: vi.fn().mockResolvedValue({ producedCommits: false, fixed: 0 }),
      };
      const commandExecutor: CommandExecutor = {
        exec: vi.fn().mockResolvedValue(undefined),
      };

      const reporter = new MaintenanceReporter({ persistDir: tmpDir });
      await reporter.load();

      const taskRunner = new TaskRunner({
        config,
        checkRunner,
        agentDispatcher,
        commandExecutor,
        cwd: '/test/project',
      });

      const onTaskDue = async (task: TaskDefinition) => {
        const result = await taskRunner.run(task);
        scheduler.recordRun(result);
        await reporter.record(result);
      };

      const leaderElector = {
        electLeader: vi.fn().mockResolvedValue({ ok: true, value: 'claimed' }),
      };

      const scheduler = new MaintenanceScheduler({
        config,
        leaderElector: leaderElector as any,
        logger: createMockLogger() as any,
        onTaskDue,
      });

      await scheduler.evaluate(new Date('2026-04-17T02:00:00'));

      const status = scheduler.getStatus();
      expect(status.history).toHaveLength(1);
      expect(status.history[0]!.status).toBe('failure');
      expect(status.history[0]!.error).toContain('check binary not found');

      const reporterHistory = reporter.getHistory(100, 0);
      expect(reporterHistory).toHaveLength(1);
      expect(reporterHistory[0]!.status).toBe('failure');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
