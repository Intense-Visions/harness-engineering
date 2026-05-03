# Plan: Scheduled Maintenance Phase 3 -- Task Runner

**Date:** 2026-04-17 | **Spec:** docs/changes/scheduled-maintenance/proposal.md | **Tasks:** 7 | **Time:** ~28 min

## Goal

Create a `TaskRunner` class that accepts a `TaskDefinition` + `MaintenanceConfig` and dispatches the correct execution path for all four task types (`mechanical-ai`, `pure-ai`, `report-only`, `housekeeping`), returning a `RunResult`. Wire it into the orchestrator's `onTaskDue` callback.

## Observable Truths (Acceptance Criteria)

1. **Event-driven (mechanical-ai, findings):** When `TaskRunner.run()` is called with a `mechanical-ai` task whose check produces fixable findings (>0), the runner invokes the agent runner with the task's `fixSkill` and returns `{ status: 'success', findings: N, fixed: N }`.
2. **Event-driven (mechanical-ai, no findings):** When `TaskRunner.run()` is called with a `mechanical-ai` task whose check produces zero fixable findings, the runner returns `{ status: 'no-issues', findings: 0 }` and does NOT invoke the agent runner.
3. **Event-driven (pure-ai):** When `TaskRunner.run()` is called with a `pure-ai` task, the runner always invokes the agent runner with the task's `fixSkill`, regardless of any precondition.
4. **State-driven (AI backend):** While no per-task `aiBackend` override is configured, the system shall use `config.aiBackend` (default: `'local'`) when constructing the agent runner for AI tasks.
5. **Event-driven (report-only):** When `TaskRunner.run()` is called with a `report-only` task, the runner executes the check command, returns `{ status: 'success', findings: N, prUrl: null }`, and never invokes the agent runner.
6. **Event-driven (housekeeping):** When `TaskRunner.run()` is called with a `housekeeping` task, the runner executes the command directly, returns `{ status: 'success', prUrl: null }`, and never invokes the agent runner.
7. **Unwanted (error isolation):** If any execution path throws, then the system shall not propagate the exception -- it shall return `{ status: 'failure', error: <message> }`.
8. **Ubiquitous (orchestrator wiring):** The `onTaskDue` callback in `orchestrator.ts` calls `TaskRunner.run()` and records the result via `scheduler.recordRun()`.
9. **Ubiquitous (tests pass):** `npx vitest run packages/orchestrator/tests/maintenance/task-runner.test.ts` passes with all tests green.
10. **Ubiquitous (harness validate):** `harness validate` passes.

## File Map

```
CREATE  packages/orchestrator/src/maintenance/task-runner.ts
CREATE  packages/orchestrator/tests/maintenance/task-runner.test.ts
MODIFY  packages/orchestrator/src/maintenance/index.ts (add TaskRunner export)
MODIFY  packages/orchestrator/src/orchestrator.ts (wire onTaskDue to TaskRunner.run)
```

## Tasks

### Task 1: Create TaskRunner class with constructor and `run()` dispatch

**Depends on:** none | **Files:** `packages/orchestrator/src/maintenance/task-runner.ts`

The TaskRunner needs dependency-injected interfaces for check commands, agent dispatch, and command execution so it is testable without real CLI or agent infrastructure.

1. Create `packages/orchestrator/src/maintenance/task-runner.ts` with the following code:

```typescript
import type { MaintenanceConfig } from '@harness-engineering/types';
import type { TaskDefinition, RunResult } from './types';

/**
 * Interface for running CLI check commands in-process.
 * Each method returns a structured result with a findings count.
 */
export interface CheckCommandRunner {
  /**
   * Runs a check command and returns its structured output.
   * @param command - CLI command args (e.g., ['check-arch'])
   * @param cwd - Working directory
   * @returns Object with findings count and whether the check passed
   */
  run(command: string[], cwd: string): Promise<CheckCommandResult>;
}

export interface CheckCommandResult {
  passed: boolean;
  findings: number;
  /** Raw output for logging/reporting */
  output: string;
}

/**
 * Interface for dispatching an AI agent to fix issues.
 * Wraps AgentRunner.runSession() with maintenance-specific parameters.
 */
export interface AgentDispatcher {
  /**
   * Dispatch an AI agent to fix issues on a branch.
   * @param skill - Skill name to dispatch (e.g., 'harness-arch-fix')
   * @param branch - Branch to work on
   * @param backendName - Backend name to use (e.g., 'local', 'claude')
   * @param cwd - Working directory (worktree path)
   * @returns Whether the agent produced any commits
   */
  dispatch(
    skill: string,
    branch: string,
    backendName: string,
    cwd: string
  ): Promise<AgentDispatchResult>;
}

export interface AgentDispatchResult {
  producedCommits: boolean;
  fixed: number;
}

/**
 * Interface for running housekeeping commands directly.
 */
export interface CommandExecutor {
  /**
   * Executes a command directly (no AI).
   * @param command - Command args (e.g., ['cleanup-sessions'])
   * @param cwd - Working directory
   */
  exec(command: string[], cwd: string): Promise<void>;
}

export interface TaskRunnerOptions {
  config: MaintenanceConfig;
  checkRunner: CheckCommandRunner;
  agentDispatcher: AgentDispatcher;
  commandExecutor: CommandExecutor;
  /** Project root directory for running commands */
  cwd: string;
}

/**
 * TaskRunner executes a single maintenance task based on its type.
 *
 * Execution paths:
 * - mechanical-ai: run check -> if findings, dispatch AI agent
 * - pure-ai: always dispatch AI agent
 * - report-only: run check, record findings, no AI
 * - housekeeping: run command directly, no AI
 */
export class TaskRunner {
  private config: MaintenanceConfig;
  private checkRunner: CheckCommandRunner;
  private agentDispatcher: AgentDispatcher;
  private commandExecutor: CommandExecutor;
  private cwd: string;

  constructor(options: TaskRunnerOptions) {
    this.config = options.config;
    this.checkRunner = options.checkRunner;
    this.agentDispatcher = options.agentDispatcher;
    this.commandExecutor = options.commandExecutor;
    this.cwd = options.cwd;
  }

  /**
   * Run a maintenance task and return the result.
   * Dispatches to the appropriate execution path based on task type.
   * Never throws -- errors are captured in the RunResult.
   */
  async run(task: TaskDefinition): Promise<RunResult> {
    const startedAt = new Date().toISOString();
    try {
      switch (task.type) {
        case 'mechanical-ai':
          return await this.runMechanicalAI(task, startedAt);
        case 'pure-ai':
          return await this.runPureAI(task, startedAt);
        case 'report-only':
          return await this.runReportOnly(task, startedAt);
        case 'housekeeping':
          return await this.runHousekeeping(task, startedAt);
        default: {
          const _exhaustive: never = task.type;
          return this.failureResult(task.id, startedAt, `Unknown task type: ${_exhaustive}`);
        }
      }
    } catch (err) {
      return this.failureResult(task.id, startedAt, String(err));
    }
  }

  /**
   * Mechanical-AI: run check command, dispatch AI agent only if fixable findings exist.
   */
  private async runMechanicalAI(task: TaskDefinition, startedAt: string): Promise<RunResult> {
    if (!task.checkCommand || task.checkCommand.length === 0) {
      return this.failureResult(task.id, startedAt, 'mechanical-ai task missing checkCommand');
    }
    if (!task.fixSkill) {
      return this.failureResult(task.id, startedAt, 'mechanical-ai task missing fixSkill');
    }
    if (!task.branch) {
      return this.failureResult(task.id, startedAt, 'mechanical-ai task missing branch');
    }

    const checkResult = await this.checkRunner.run(task.checkCommand, this.cwd);

    if (checkResult.findings === 0) {
      return {
        taskId: task.id,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'no-issues',
        findings: 0,
        fixed: 0,
        prUrl: null,
        prUpdated: false,
      };
    }

    const backendName = this.resolveBackend(task.id);
    const agentResult = await this.agentDispatcher.dispatch(
      task.fixSkill,
      task.branch,
      backendName,
      this.cwd
    );

    return {
      taskId: task.id,
      startedAt,
      completedAt: new Date().toISOString(),
      status: 'success',
      findings: checkResult.findings,
      fixed: agentResult.fixed,
      prUrl: null, // PR creation is handled by PRManager in Phase 4
      prUpdated: false,
    };
  }

  /**
   * Pure-AI: always dispatch agent with configured skill.
   */
  private async runPureAI(task: TaskDefinition, startedAt: string): Promise<RunResult> {
    if (!task.fixSkill) {
      return this.failureResult(task.id, startedAt, 'pure-ai task missing fixSkill');
    }
    if (!task.branch) {
      return this.failureResult(task.id, startedAt, 'pure-ai task missing branch');
    }

    const backendName = this.resolveBackend(task.id);
    const agentResult = await this.agentDispatcher.dispatch(
      task.fixSkill,
      task.branch,
      backendName,
      this.cwd
    );

    return {
      taskId: task.id,
      startedAt,
      completedAt: new Date().toISOString(),
      status: agentResult.producedCommits ? 'success' : 'no-issues',
      findings: 0,
      fixed: agentResult.fixed,
      prUrl: null, // PR creation is handled by PRManager in Phase 4
      prUpdated: false,
    };
  }

  /**
   * Report-only: run check command, record metrics, no AI dispatch.
   */
  private async runReportOnly(task: TaskDefinition, startedAt: string): Promise<RunResult> {
    if (!task.checkCommand || task.checkCommand.length === 0) {
      return this.failureResult(task.id, startedAt, 'report-only task missing checkCommand');
    }

    const checkResult = await this.checkRunner.run(task.checkCommand, this.cwd);

    return {
      taskId: task.id,
      startedAt,
      completedAt: new Date().toISOString(),
      status: 'success',
      findings: checkResult.findings,
      fixed: 0,
      prUrl: null,
      prUpdated: false,
    };
  }

  /**
   * Housekeeping: run command directly, no AI, no PR.
   */
  private async runHousekeeping(task: TaskDefinition, startedAt: string): Promise<RunResult> {
    if (!task.checkCommand || task.checkCommand.length === 0) {
      return this.failureResult(task.id, startedAt, 'housekeeping task missing checkCommand');
    }

    await this.commandExecutor.exec(task.checkCommand, this.cwd);

    return {
      taskId: task.id,
      startedAt,
      completedAt: new Date().toISOString(),
      status: 'success',
      findings: 0,
      fixed: 0,
      prUrl: null,
      prUpdated: false,
    };
  }

  /**
   * Resolve which AI backend name to use for a given task.
   * Priority: per-task override > global config > 'local' default.
   */
  private resolveBackend(taskId: string): string {
    const taskOverride = this.config.tasks?.[taskId]?.aiBackend;
    if (taskOverride) return taskOverride;
    return this.config.aiBackend ?? 'local';
  }

  private failureResult(taskId: string, startedAt: string, error: string): RunResult {
    return {
      taskId,
      startedAt,
      completedAt: new Date().toISOString(),
      status: 'failure',
      findings: 0,
      fixed: 0,
      prUrl: null,
      prUpdated: false,
      error,
    };
  }
}
```

2. Run: `npx harness validate`
3. Commit: `feat(maintenance): add TaskRunner class with four execution paths`

---

### Task 2: Write tests for mechanical-ai execution path

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/maintenance/task-runner.test.ts`

1. Create `packages/orchestrator/tests/maintenance/task-runner.test.ts` with:

```typescript
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
```

2. Run: `npx vitest run packages/orchestrator/tests/maintenance/task-runner.test.ts` -- observe all tests pass.
3. Run: `npx harness validate`
4. Commit: `test(maintenance): add task-runner tests for mechanical-ai path`

---

### Task 3: Write tests for pure-ai execution path

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/maintenance/task-runner.test.ts`

1. Append to the test file inside the top-level `describe('TaskRunner')` block, after the `mechanical-ai` describe block:

```typescript
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
```

2. Run: `npx vitest run packages/orchestrator/tests/maintenance/task-runner.test.ts` -- observe all tests pass.
3. Run: `npx harness validate`
4. Commit: `test(maintenance): add task-runner tests for pure-ai path and backend resolution`

---

### Task 4: Write tests for report-only and housekeeping execution paths

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/maintenance/task-runner.test.ts`

1. Append to the test file inside the top-level `describe('TaskRunner')` block:

```typescript
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
```

2. Run: `npx vitest run packages/orchestrator/tests/maintenance/task-runner.test.ts` -- observe all tests pass.
3. Run: `npx harness validate`
4. Commit: `test(maintenance): add task-runner tests for report-only and housekeeping paths`

---

### Task 5: Write tests for error handling and edge cases

**Depends on:** Task 1 | **Files:** `packages/orchestrator/tests/maintenance/task-runner.test.ts`

1. Append to the test file inside the top-level `describe('TaskRunner')` block:

```typescript
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

  it('catches agent dispatcher errors and returns failure', async () => {
    const checkRunner = createMockCheckRunner({ findings: 2 });
    const agentDispatcher: AgentDispatcher = {
      dispatch: vi.fn().mockRejectedValue(new Error('agent session failed')),
    };
    const runner = new TaskRunner(createRunnerOptions({ checkRunner, agentDispatcher }));

    const result = await runner.run(ARCH_TASK);

    expect(result.status).toBe('failure');
    expect(result.error).toContain('agent session failed');
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
```

Note: `ARCH_TASK` is defined at the top of the file (from Task 2) and is accessible here since it is in the same module scope.

2. Run: `npx vitest run packages/orchestrator/tests/maintenance/task-runner.test.ts` -- observe all tests pass.
3. Run: `npx harness validate`
4. Commit: `test(maintenance): add task-runner error handling and edge case tests`

---

### Task 6: Export TaskRunner from maintenance index

**Depends on:** Task 1 | **Files:** `packages/orchestrator/src/maintenance/index.ts`

1. Add TaskRunner export to `packages/orchestrator/src/maintenance/index.ts`. After the `cronMatchesNow` export line, add:

```typescript
export { TaskRunner } from './task-runner';
export type {
  CheckCommandRunner,
  CheckCommandResult,
  AgentDispatcher,
  AgentDispatchResult,
  CommandExecutor,
  TaskRunnerOptions,
} from './task-runner';
```

Also update the module comment to reflect Phase 3 completion.

The full file should read:

```typescript
/**
 * Scheduled maintenance module -- public exports.
 *
 * Phase 1 exports types and the task registry.
 * Phase 2 adds MaintenanceScheduler and cron matching.
 * Phase 3 adds TaskRunner with four execution paths.
 * Subsequent phases add:
 * - PRManager (Phase 4)
 * - Reporter (Phase 5)
 */

export type {
  TaskType,
  TaskDefinition,
  RunResult,
  ScheduleEntry,
  MaintenanceStatus,
} from './types';

export { BUILT_IN_TASKS } from './task-registry';

export { MaintenanceScheduler } from './scheduler';
export type {
  MaintenanceSchedulerOptions,
  SchedulerLogger,
  SchedulerClaimManager,
} from './scheduler';

export { cronMatchesNow } from './cron-matcher';

export { TaskRunner } from './task-runner';
export type {
  CheckCommandRunner,
  CheckCommandResult,
  AgentDispatcher,
  AgentDispatchResult,
  CommandExecutor,
  TaskRunnerOptions,
} from './task-runner';
```

2. Run: `npx harness validate`
3. Commit: `feat(maintenance): export TaskRunner from maintenance module index`

---

### Task 7: Wire TaskRunner into orchestrator's onTaskDue callback

**Depends on:** Task 1, Task 6 | **Files:** `packages/orchestrator/src/orchestrator.ts`

1. In `packages/orchestrator/src/orchestrator.ts`, add the import for `TaskRunner` at the top (near the existing `MaintenanceScheduler` import on line 67):

Replace:

```typescript
import { MaintenanceScheduler } from './maintenance/scheduler';
```

with:

```typescript
import { MaintenanceScheduler } from './maintenance/scheduler';
import { TaskRunner } from './maintenance/task-runner';
import type {
  CheckCommandRunner,
  AgentDispatcher,
  CommandExecutor,
} from './maintenance/task-runner';
```

2. Replace the `onTaskDue` callback in the `start()` method. Find the block (around line 1490-1502):

```typescript
// Start maintenance scheduler if enabled
if (this.config.maintenance?.enabled) {
  this.maintenanceScheduler = new MaintenanceScheduler({
    config: this.config.maintenance,
    claimManager: this.claimManager!,
    logger: this.logger,
    onTaskDue: async (task) => {
      this.logger.info(`Maintenance task due: ${task.id}`, { taskId: task.id });
      // Phase 3 will wire this to TaskRunner.run(task)
    },
  });
  this.maintenanceScheduler.start();
}
```

Replace with:

```typescript
// Start maintenance scheduler if enabled
if (this.config.maintenance?.enabled) {
  const taskRunner = this.createMaintenanceTaskRunner();
  this.maintenanceScheduler = new MaintenanceScheduler({
    config: this.config.maintenance,
    claimManager: this.claimManager!,
    logger: this.logger,
    onTaskDue: async (task) => {
      this.logger.info(`Maintenance task due: ${task.id}`, { taskId: task.id });
      const result = await taskRunner.run(task);
      this.maintenanceScheduler!.recordRun(result);
      this.logger.info(`Maintenance task completed: ${task.id}`, {
        taskId: task.id,
        status: result.status,
        findings: result.findings,
        fixed: result.fixed,
      });
    },
  });
  this.maintenanceScheduler.start();
}
```

3. Add the `createMaintenanceTaskRunner` private method to the `Orchestrator` class (place it near the `createBackend` method, around line 220):

```typescript
  /**
   * Creates a TaskRunner for the maintenance scheduler.
   * Provides stub implementations for check/agent/command execution.
   * Phase 4 (PRManager) and Phase 5 (Reporter) will enhance these.
   */
  private createMaintenanceTaskRunner(): TaskRunner {
    const checkRunner: CheckCommandRunner = {
      run: async (command: string[], cwd: string) => {
        // Stub: Phase 4 will integrate with real check commands.
        // For now, return no findings so mechanical-ai tasks skip AI dispatch.
        this.logger.info('Maintenance check runner invoked (stub)', { command, cwd });
        return { passed: true, findings: 0, output: '' };
      },
    };

    const agentDispatcher: AgentDispatcher = {
      dispatch: async (skill: string, branch: string, backendName: string, cwd: string) => {
        // Stub: Phase 4 will integrate with real AgentRunner dispatch.
        this.logger.info('Maintenance agent dispatcher invoked (stub)', {
          skill,
          branch,
          backendName,
          cwd,
        });
        return { producedCommits: false, fixed: 0 };
      },
    };

    const commandExecutor: CommandExecutor = {
      dispatch: async (command: string[], cwd: string) => {
        // Stub: Phase 4 will integrate with real command execution.
        this.logger.info('Maintenance command executor invoked (stub)', { command, cwd });
      },
    } as unknown as CommandExecutor;

    return new TaskRunner({
      config: this.config.maintenance!,
      checkRunner,
      agentDispatcher,
      commandExecutor,
      cwd: this.projectRoot,
    });
  }
```

Note: The `commandExecutor` stub uses `dispatch` but the interface expects `exec`. Fix the stub to use the correct method name:

```typescript
const commandExecutor: CommandExecutor = {
  exec: async (command: string[], cwd: string) => {
    // Stub: Phase 4 will integrate with real command execution.
    this.logger.info('Maintenance command executor invoked (stub)', { command, cwd });
  },
};
```

4. Run: `npx vitest run packages/orchestrator/tests/maintenance/task-runner.test.ts`
5. Run: `npx harness validate`
6. Commit: `feat(maintenance): wire TaskRunner into orchestrator onTaskDue callback`

`[checkpoint:human-verify]` -- Verify the orchestrator wiring compiles and all existing maintenance tests still pass: `npx vitest run packages/orchestrator/tests/maintenance/`

## Parallel Opportunities

- Tasks 2, 3, 4, and 5 (test tasks) are independent of each other and can be executed in parallel. They all depend only on Task 1.
- Task 6 depends only on Task 1.
- Task 7 depends on Tasks 1 and 6.

## Dependencies

```
Task 1 (TaskRunner class)
  ├── Task 2 (mechanical-ai tests)
  ├── Task 3 (pure-ai tests)
  ├── Task 4 (report-only + housekeeping tests)
  ├── Task 5 (error handling tests)
  ├── Task 6 (index export)
  └── Task 7 (orchestrator wiring) -- also depends on Task 6
```

## Estimated Total

7 tasks x ~4 min = ~28 minutes
