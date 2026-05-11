import { describe, it, expect, vi } from 'vitest';
import { TaskRunner } from '../../src/maintenance/task-runner';
import { MaintenanceReporter } from '../../src/maintenance/reporter';
import { BUILT_IN_TASKS } from '../../src/maintenance/task-registry';
import type {
  CheckCommandRunner,
  AgentDispatcher,
  CommandExecutor,
} from '../../src/maintenance/task-runner';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SILENT_LOGGER = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

function silentChecks(): CheckCommandRunner {
  return { run: vi.fn().mockResolvedValue({ passed: true, findings: 0, output: '' }) };
}
function silentAgent(): AgentDispatcher {
  return { dispatch: vi.fn().mockResolvedValue({ producedCommits: false, fixed: 0 }) };
}

describe('main-sync trigger smoke (Phase 2)', () => {
  it('routes a triggered main-sync run through TaskRunner.runHousekeeping and records the result', async () => {
    const persistDir = mkdtempSync(join(tmpdir(), 'main-sync-trigger-'));
    try {
      const reporter = new MaintenanceReporter({
        persistDir,
        logger: SILENT_LOGGER,
      });
      await reporter.load();

      const stdout =
        '{"status":"updated","from":"aaaaaaa","to":"bbbbbbb","defaultBranch":"main"}\n';
      const executor: CommandExecutor = {
        exec: vi.fn().mockResolvedValue({ stdout }),
      };

      const taskRunner = new TaskRunner({
        config: { enabled: true },
        checkRunner: silentChecks(),
        agentDispatcher: silentAgent(),
        commandExecutor: executor,
        cwd: persistDir,
      });

      const task = BUILT_IN_TASKS.find((t) => t.id === 'main-sync');
      expect(task).toBeDefined();

      // Simulate the orchestrator's onTaskDue callback (orchestrator.ts:517-541).
      const result = await taskRunner.run(task!);
      await reporter.record(result);

      expect(executor.exec).toHaveBeenCalledWith(['harness', 'sync-main', '--json'], persistDir);
      expect(result.taskId).toBe('main-sync');
      expect(result.status).toBe('success');
      expect(result.findings).toBe(0);
      expect(result.error).toBeUndefined();

      const history = reporter.getHistory(10, 0);
      expect(history).toHaveLength(1);
      expect(history[0]!.taskId).toBe('main-sync');
      expect(history[0]!.status).toBe('success');
    } finally {
      rmSync(persistDir, { recursive: true, force: true });
    }
  });

  it('records a skipped sync-main run with the skip reason in the run history', async () => {
    const persistDir = mkdtempSync(join(tmpdir(), 'main-sync-trigger-skip-'));
    try {
      const reporter = new MaintenanceReporter({ persistDir, logger: SILENT_LOGGER });
      await reporter.load();

      const stdout =
        '{"status":"skipped","reason":"diverged","detail":"local main has 2 extra commits","defaultBranch":"main"}\n';
      const executor: CommandExecutor = {
        exec: vi.fn().mockResolvedValue({ stdout }),
      };

      const taskRunner = new TaskRunner({
        config: { enabled: true },
        checkRunner: silentChecks(),
        agentDispatcher: silentAgent(),
        commandExecutor: executor,
        cwd: persistDir,
      });
      const task = BUILT_IN_TASKS.find((t) => t.id === 'main-sync')!;
      const result = await taskRunner.run(task);
      await reporter.record(result);

      expect(result.status).toBe('skipped');
      expect(result.error).toContain('diverged');

      const history = reporter.getHistory(10, 0);
      expect(history).toHaveLength(1);
      expect(history[0]!.status).toBe('skipped');
      expect(history[0]!.error).toContain('diverged');
    } finally {
      rmSync(persistDir, { recursive: true, force: true });
    }
  });
});
