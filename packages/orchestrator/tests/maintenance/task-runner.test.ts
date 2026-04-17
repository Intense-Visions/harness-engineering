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

  describe('pure-ai tasks', () => {
    const DEAD_CODE_TASK: TaskDefinition = {
      id: 'dead-code',
      type: 'pure-ai',
      description: 'Find and remove dead code',
      schedule: '0 2 * * 0',
      branch: 'harness-maint/dead-code',
      fixSkill: 'harness-codebase-cleanup',
    };

    it('always dispatches agent regardless of check results', async () => {
      const checkRunner = createMockCheckRunner();
      const agentDispatcher = createMockAgentDispatcher({ producedCommits: true, fixed: 2 });
      const runner = new TaskRunner(createRunnerOptions({ checkRunner, agentDispatcher }));

      const result = await runner.run(DEAD_CODE_TASK);

      expect(result.status).toBe('success');
      expect(result.fixed).toBe(2);
      expect(checkRunner.run).not.toHaveBeenCalled();
      expect(agentDispatcher.dispatch).toHaveBeenCalledWith(
        'harness-codebase-cleanup',
        'harness-maint/dead-code',
        'local',
        '/test/project'
      );
    });

    it('returns no-issues when agent produces no commits', async () => {
      const agentDispatcher = createMockAgentDispatcher({ producedCommits: false, fixed: 0 });
      const runner = new TaskRunner(createRunnerOptions({ agentDispatcher }));

      const result = await runner.run(DEAD_CODE_TASK);

      expect(result.status).toBe('no-issues');
      expect(result.fixed).toBe(0);
    });

    it('uses per-task aiBackend override when configured', async () => {
      const config: MaintenanceConfig = {
        enabled: true,
        aiBackend: 'local',
        tasks: { 'dead-code': { aiBackend: 'claude' } },
      };
      const agentDispatcher = createMockAgentDispatcher({ producedCommits: true, fixed: 1 });
      const runner = new TaskRunner(createRunnerOptions({ config, agentDispatcher }));

      await runner.run(DEAD_CODE_TASK);

      expect(agentDispatcher.dispatch).toHaveBeenCalledWith(
        'harness-codebase-cleanup',
        'harness-maint/dead-code',
        'claude', // per-task override
        '/test/project'
      );
    });

    it('uses global aiBackend when no per-task override', async () => {
      const config: MaintenanceConfig = { enabled: true, aiBackend: 'anthropic' };
      const agentDispatcher = createMockAgentDispatcher({ producedCommits: true, fixed: 1 });
      const runner = new TaskRunner(createRunnerOptions({ config, agentDispatcher }));

      await runner.run(DEAD_CODE_TASK);

      expect(agentDispatcher.dispatch).toHaveBeenCalledWith(
        'harness-codebase-cleanup',
        'harness-maint/dead-code',
        'anthropic', // global config
        '/test/project'
      );
    });

    it('defaults to local when no backend configured', async () => {
      const config: MaintenanceConfig = { enabled: true };
      const agentDispatcher = createMockAgentDispatcher({ producedCommits: true, fixed: 1 });
      const runner = new TaskRunner(createRunnerOptions({ config, agentDispatcher }));

      await runner.run(DEAD_CODE_TASK);

      expect(agentDispatcher.dispatch).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        'local', // default
        expect.any(String)
      );
    });

    it('returns failure when fixSkill is missing', async () => {
      const task: TaskDefinition = { ...DEAD_CODE_TASK, fixSkill: undefined };
      const runner = new TaskRunner(createRunnerOptions());

      const result = await runner.run(task);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('missing fixSkill');
    });
  });
});
