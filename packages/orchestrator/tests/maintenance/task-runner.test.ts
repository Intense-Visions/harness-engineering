import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskRunner } from '../../src/maintenance/task-runner';
import type {
  CheckCommandRunner,
  AgentDispatcher,
  CommandExecutor,
  TaskRunnerOptions,
  PRLifecycleManager,
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

function createMockCommandExecutor(stdout = ''): CommandExecutor {
  return {
    exec: vi.fn().mockResolvedValue({ stdout }),
  };
}

function createMockPRManager(prUrl?: string): PRLifecycleManager {
  return {
    ensureBranch: vi.fn().mockResolvedValue({ created: true, recreated: false }),
    ensurePR: vi.fn().mockResolvedValue({
      prUrl: prUrl ?? 'https://github.com/org/repo/pull/42',
      prUpdated: false,
    }),
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

    it('calls prManager.ensureBranch and ensurePR when findings and agent commits exist', async () => {
      const prManager = createMockPRManager();
      const runner = new TaskRunner(
        createRunnerOptions({
          checkRunner: createMockCheckRunner({ findings: 3 }),
          agentDispatcher: createMockAgentDispatcher({ producedCommits: true, fixed: 2 }),
          prManager,
        })
      );

      const result = await runner.run(ARCH_TASK);

      expect(prManager.ensureBranch).toHaveBeenCalledWith('harness-maint/arch-fixes', 'main');
      expect(prManager.ensurePR).toHaveBeenCalledWith(
        ARCH_TASK,
        expect.stringContaining('Findings: 3')
      );
      expect(result.prUrl).toBe('https://github.com/org/repo/pull/42');
      expect(result.prUpdated).toBe(false);
      expect(result.status).toBe('success');
    });

    it('does not call ensurePR when agent produces no commits', async () => {
      const prManager = createMockPRManager();
      const runner = new TaskRunner(
        createRunnerOptions({
          checkRunner: createMockCheckRunner({ findings: 3 }),
          agentDispatcher: createMockAgentDispatcher({ producedCommits: false, fixed: 0 }),
          prManager,
        })
      );

      const result = await runner.run(ARCH_TASK);

      expect(prManager.ensureBranch).toHaveBeenCalled();
      expect(prManager.ensurePR).not.toHaveBeenCalled();
      expect(result.prUrl).toBeNull();
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

    it('calls prManager.ensureBranch and ensurePR when agent produces commits', async () => {
      const prManager = createMockPRManager('https://github.com/org/repo/pull/99');
      const pureAITask: TaskDefinition = {
        id: 'dead-code',
        type: 'pure-ai',
        description: 'Remove dead code',
        schedule: '0 2 * * 0',
        branch: 'harness-maint/dead-code',
        fixSkill: 'cleanup-dead-code',
      };
      const runner = new TaskRunner(
        createRunnerOptions({
          agentDispatcher: createMockAgentDispatcher({ producedCommits: true, fixed: 5 }),
          prManager,
        })
      );

      const result = await runner.run(pureAITask);

      expect(prManager.ensureBranch).toHaveBeenCalledWith('harness-maint/dead-code', 'main');
      expect(prManager.ensurePR).toHaveBeenCalledWith(
        pureAITask,
        expect.stringContaining('Fixed: 5')
      );
      expect(result.prUrl).toBe('https://github.com/org/repo/pull/99');
      expect(result.status).toBe('success');
    });
  });

  describe('report-only tasks', () => {
    const PERF_TASK: TaskDefinition = {
      id: 'perf-check',
      type: 'report-only',
      description: 'Run performance checks and record metrics',
      schedule: '0 6 * * 1',
      branch: null,
      checkCommand: ['check-perf'],
    };

    it('runs check and returns findings without dispatching agent', async () => {
      const checkRunner = createMockCheckRunner({ findings: 3 });
      const agentDispatcher = createMockAgentDispatcher();
      const runner = new TaskRunner(createRunnerOptions({ checkRunner, agentDispatcher }));

      const result = await runner.run(PERF_TASK);

      expect(result.status).toBe('success');
      expect(result.findings).toBe(3);
      expect(result.fixed).toBe(0);
      expect(result.prUrl).toBeNull();
      expect(checkRunner.run).toHaveBeenCalledWith(['check-perf'], '/test/project');
      expect(agentDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('returns failure when checkCommand is missing', async () => {
      const task: TaskDefinition = { ...PERF_TASK, checkCommand: undefined };
      const runner = new TaskRunner(createRunnerOptions());

      const result = await runner.run(task);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('missing checkCommand');
    });
  });

  describe('housekeeping tasks', () => {
    const SESSION_CLEANUP_TASK: TaskDefinition = {
      id: 'session-cleanup',
      type: 'housekeeping',
      description: 'Clean up stale orchestrator sessions',
      schedule: '0 0 * * *',
      branch: null,
      checkCommand: ['cleanup-sessions'],
    };

    it('runs command directly and returns success', async () => {
      const commandExecutor = createMockCommandExecutor();
      const agentDispatcher = createMockAgentDispatcher();
      const runner = new TaskRunner(createRunnerOptions({ commandExecutor, agentDispatcher }));

      const result = await runner.run(SESSION_CLEANUP_TASK);

      expect(result.status).toBe('success');
      expect(result.findings).toBe(0);
      expect(result.fixed).toBe(0);
      expect(result.prUrl).toBeNull();
      expect(commandExecutor.exec).toHaveBeenCalledWith(['cleanup-sessions'], '/test/project');
      expect(agentDispatcher.dispatch).not.toHaveBeenCalled();
    });

    it('returns failure when command throws', async () => {
      const commandExecutor: CommandExecutor = {
        exec: vi.fn().mockRejectedValue(new Error('cleanup failed')),
      };
      const runner = new TaskRunner(createRunnerOptions({ commandExecutor }));

      const result = await runner.run(SESSION_CLEANUP_TASK);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('cleanup failed');
    });

    it('returns failure when checkCommand is missing', async () => {
      const task: TaskDefinition = { ...SESSION_CLEANUP_TASK, checkCommand: undefined };
      const runner = new TaskRunner(createRunnerOptions());

      const result = await runner.run(task);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('missing checkCommand');
    });
  });

  describe('error handling', () => {
    it('catches check runner errors and returns failure', async () => {
      const checkRunner: CheckCommandRunner = {
        run: vi.fn().mockRejectedValue(new Error('check-arch crashed')),
      };
      const runner = new TaskRunner(createRunnerOptions({ checkRunner }));

      const result = await runner.run(ARCH_TASK);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('check-arch crashed');
    });

    it('catches agent dispatcher errors for mechanical-ai and preserves findings count', async () => {
      const checkRunner = createMockCheckRunner({ findings: 5 });
      const agentDispatcher: AgentDispatcher = {
        dispatch: vi.fn().mockRejectedValue(new Error('agent session failed')),
      };
      const runner = new TaskRunner(createRunnerOptions({ checkRunner, agentDispatcher }));

      const result = await runner.run(ARCH_TASK);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('agent session failed');
      expect(result.findings).toBe(5);
      expect(result.fixed).toBe(0);
    });

    it('catches agent dispatcher errors for pure-ai and returns failure', async () => {
      const agentDispatcher: AgentDispatcher = {
        dispatch: vi.fn().mockRejectedValue(new Error('local model unavailable')),
      };
      const runner = new TaskRunner(createRunnerOptions({ agentDispatcher }));

      const DEAD_CODE_TASK: TaskDefinition = {
        id: 'dead-code',
        type: 'pure-ai',
        description: 'Find and remove dead code',
        schedule: '0 2 * * 0',
        branch: 'harness-maint/dead-code',
        fixSkill: 'harness-codebase-cleanup',
      };

      const result = await runner.run(DEAD_CODE_TASK);

      expect(result.status).toBe('failure');
      expect(result.error).toContain('local model unavailable');
    });

    it('populates startedAt and completedAt timestamps', async () => {
      const runner = new TaskRunner(
        createRunnerOptions({
          checkRunner: createMockCheckRunner({ findings: 0 }),
        })
      );

      const result = await runner.run(ARCH_TASK);

      expect(result.startedAt).toBeTruthy();
      expect(result.completedAt).toBeTruthy();
      expect(new Date(result.startedAt).getTime()).toBeLessThanOrEqual(
        new Date(result.completedAt).getTime()
      );
    });

    it('returns prUrl: null when no prManager is provided (backward compat)', async () => {
      const runner = new TaskRunner(
        createRunnerOptions({
          checkRunner: createMockCheckRunner({ findings: 3 }),
          agentDispatcher: createMockAgentDispatcher({ producedCommits: true, fixed: 2 }),
          // No prManager
        })
      );

      const result = await runner.run(ARCH_TASK);

      expect(result.prUrl).toBeNull();
      expect(result.status).toBe('success');
    });

    it('includes taskId in all results', async () => {
      const runner = new TaskRunner(
        createRunnerOptions({
          checkRunner: createMockCheckRunner({ findings: 0 }),
        })
      );

      const result = await runner.run(ARCH_TASK);

      expect(result.taskId).toBe('arch-violations');
    });
  });

  describe('housekeeping JSON capture (sync-main contract)', () => {
    const SYNC_TASK: TaskDefinition = {
      id: 'main-sync',
      type: 'housekeeping',
      description: 'Fast-forward local default branch from origin',
      schedule: '*/15 * * * *',
      branch: null,
      checkCommand: ['harness', 'sync-main', '--json'],
    };

    it("maps sync-main 'updated' JSON to status: 'success' with no findings", async () => {
      const stdout =
        '{"status":"updated","from":"aaaaaaa","to":"bbbbbbb","defaultBranch":"main"}\n';
      const executor = createMockCommandExecutor(stdout);
      const runner = new TaskRunner(createRunnerOptions({ commandExecutor: executor }));

      const result = await runner.run(SYNC_TASK);

      expect(result.status).toBe('success');
      expect(result.findings).toBe(0);
      expect(result.error).toBeUndefined();
      expect(executor.exec).toHaveBeenCalledWith(
        ['harness', 'sync-main', '--json'],
        '/test/project'
      );
    });

    it("maps sync-main 'no-op' JSON to status: 'success'", async () => {
      const stdout = '{"status":"no-op","defaultBranch":"main"}\n';
      const runner = new TaskRunner(
        createRunnerOptions({ commandExecutor: createMockCommandExecutor(stdout) })
      );
      const result = await runner.run(SYNC_TASK);
      expect(result.status).toBe('success');
    });

    it("maps sync-main 'skipped' JSON to status: 'skipped' with reason in error field", async () => {
      const stdout =
        '{"status":"skipped","reason":"dirty-conflict","detail":"local edits","defaultBranch":"main"}\n';
      const runner = new TaskRunner(
        createRunnerOptions({ commandExecutor: createMockCommandExecutor(stdout) })
      );
      const result = await runner.run(SYNC_TASK);
      expect(result.status).toBe('skipped');
      expect(result.error).toContain('dirty-conflict');
      expect(result.error).toContain('local edits');
    });

    it("maps sync-main 'error' JSON to status: 'failure' with error message", async () => {
      const stdout = '{"status":"error","message":"git binary missing"}\n';
      const runner = new TaskRunner(
        createRunnerOptions({ commandExecutor: createMockCommandExecutor(stdout) })
      );
      const result = await runner.run(SYNC_TASK);
      expect(result.status).toBe('failure');
      expect(result.error).toContain('git binary missing');
    });

    it('falls back to status: success for legacy housekeeping with empty stdout', async () => {
      const SESSION_CLEANUP: TaskDefinition = {
        id: 'session-cleanup',
        type: 'housekeeping',
        description: 'Clean up stale orchestrator sessions',
        schedule: '0 0 * * *',
        branch: null,
        checkCommand: ['cleanup-sessions'],
      };
      const runner = new TaskRunner(
        createRunnerOptions({ commandExecutor: createMockCommandExecutor('') })
      );
      const result = await runner.run(SESSION_CLEANUP);
      expect(result.status).toBe('success');
      expect(result.findings).toBe(0);
    });

    it('falls back to status: success for non-JSON stdout', async () => {
      const runner = new TaskRunner(
        createRunnerOptions({
          commandExecutor: createMockCommandExecutor('cleaned 4 sessions\n'),
        })
      );
      const result = await runner.run({
        ...SYNC_TASK,
        id: 'session-cleanup',
        checkCommand: ['cleanup-sessions'],
      });
      expect(result.status).toBe('success');
      expect(result.findings).toBe(0);
    });

    it('returns failure when executor throws', async () => {
      const executor: CommandExecutor = {
        exec: vi.fn().mockRejectedValue(new Error('spawn ENOENT')),
      };
      const runner = new TaskRunner(createRunnerOptions({ commandExecutor: executor }));
      const result = await runner.run(SYNC_TASK);
      expect(result.status).toBe('failure');
      expect(result.error).toContain('spawn ENOENT');
    });
  });
});
