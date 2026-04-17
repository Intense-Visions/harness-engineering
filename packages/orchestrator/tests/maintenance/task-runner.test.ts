import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskRunner } from '../../src/maintenance/task-runner';
import type {
  CheckCommandRunner,
  AgentDispatcher,
  CommandExecutor,
  TaskRunnerOptions,
} from '../../src/maintenance/task-runner';
import type { MaintenanceConfig } from '@harness-engineering/types';
import type { TaskDefinition } from '../../src/maintenance/types';

function createMockCheckRunner(
  result?: Partial<{ passed: boolean; findings: number; output: string }>
): CheckCommandRunner {
  return {
    run: vi.fn().mockResolvedValue({
      passed: result?.passed ?? true,
      findings: result?.findings ?? 0,
      output: result?.output ?? '',
    }),
  };
}

function createMockAgentDispatcher(
  result?: Partial<{ producedCommits: boolean; fixed: number }>
): AgentDispatcher {
  return {
    dispatch: vi.fn().mockResolvedValue({
      producedCommits: result?.producedCommits ?? true,
      fixed: result?.fixed ?? 0,
    }),
  };
}

function createMockCommandExecutor(): CommandExecutor {
  return {
    exec: vi.fn().mockResolvedValue(undefined),
  };
}

function createRunnerOptions(overrides?: Partial<TaskRunnerOptions>): TaskRunnerOptions {
  return {
    config: { enabled: true },
    checkRunner: createMockCheckRunner(),
    agentDispatcher: createMockAgentDispatcher(),
    commandExecutor: createMockCommandExecutor(),
    cwd: '/test/project',
    ...overrides,
  };
}

const ARCH_TASK: TaskDefinition = {
  id: 'arch-violations',
  type: 'mechanical-ai',
  description: 'Detect and fix architecture violations',
  schedule: '0 2 * * *',
  branch: 'harness-maint/arch-fixes',
  checkCommand: ['check-arch'],
  fixSkill: 'harness-arch-fix',
};

describe('TaskRunner', () => {
  describe('mechanical-ai tasks', () => {
    it('returns no-issues when check finds zero findings', async () => {
      const checkRunner = createMockCheckRunner({ findings: 0 });
      const agentDispatcher = createMockAgentDispatcher();
      const runner = new TaskRunner(createRunnerOptions({ checkRunner, agentDispatcher }));

      const result = await runner.run(ARCH_TASK);

      expect(result.status).toBe('no-issues');
      expect(result.findings).toBe(0);
      expect(result.fixed).toBe(0);
      expect(result.prUrl).toBeNull();
      expect(checkRunner.run).toHaveBeenCalledWith(['check-arch'], '/test/project');
      expect(agentDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('dispatches agent when check finds fixable issues', async () => {
      const checkRunner = createMockCheckRunner({ findings: 5, passed: false });
      const agentDispatcher = createMockAgentDispatcher({ producedCommits: true, fixed: 3 });
      const runner = new TaskRunner(createRunnerOptions({ checkRunner, agentDispatcher }));

      const result = await runner.run(ARCH_TASK);

      expect(result.status).toBe('success');
      expect(result.findings).toBe(5);
      expect(result.fixed).toBe(3);
      expect(agentDispatcher.dispatch).toHaveBeenCalledWith(
        'harness-arch-fix',
        'harness-maint/arch-fixes',
        'local', // default backend
        '/test/project'
      );
    });

    it('returns failure when checkCommand is missing', async () => {
      const task: TaskDefinition = { ...ARCH_TASK, checkCommand: undefined };
      const runner = new TaskRunner(createRunnerOptions());

      const result = await runner.run(task);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('missing checkCommand');
    });

    it('returns failure when fixSkill is missing', async () => {
      const task: TaskDefinition = { ...ARCH_TASK, fixSkill: undefined };
      const runner = new TaskRunner(createRunnerOptions());

      const result = await runner.run(task);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('missing fixSkill');
    });

    it('returns failure when branch is missing', async () => {
      const task: TaskDefinition = { ...ARCH_TASK, branch: null };
      const runner = new TaskRunner(createRunnerOptions());

      const result = await runner.run(task);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('missing branch');
    });
  });
});
