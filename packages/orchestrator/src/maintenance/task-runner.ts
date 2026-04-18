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

/**
 * Interface for managing branches and PRs for maintenance tasks.
 * Matches PRManager's public API shape for DI.
 */
export interface PRLifecycleManager {
  ensureBranch(
    branchName: string,
    baseBranch: string
  ): Promise<{ created: boolean; recreated: boolean }>;
  ensurePR(
    task: TaskDefinition,
    runSummary: string
  ): Promise<{ prUrl: string; prUpdated: boolean }>;
}

export interface TaskRunnerOptions {
  config: MaintenanceConfig;
  checkRunner: CheckCommandRunner;
  agentDispatcher: AgentDispatcher;
  commandExecutor: CommandExecutor;
  /** Project root directory for running commands */
  cwd: string;
  /** Optional PR lifecycle manager for branch/PR operations */
  prManager?: PRLifecycleManager;
  /** Base branch for PR operations (defaults to 'main') */
  baseBranch?: string;
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
  private prManager: PRLifecycleManager | null;
  private baseBranch: string;

  constructor(options: TaskRunnerOptions) {
    this.config = options.config;
    this.checkRunner = options.checkRunner;
    this.agentDispatcher = options.agentDispatcher;
    this.commandExecutor = options.commandExecutor;
    this.cwd = options.cwd;
    this.prManager = options.prManager ?? null;
    this.baseBranch = options.baseBranch ?? 'main';
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
          return this.failureResult(
            task.id,
            startedAt,
            `Unknown task type: ${String(_exhaustive)}`
          );
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

    if (this.prManager) {
      try {
        await this.prManager.ensureBranch(task.branch, this.baseBranch);
      } catch (err) {
        return this.failureResult(task.id, startedAt, `ensureBranch failed: ${String(err)}`);
      }
    }

    const backendName = this.resolveBackend(task.id);

    let agentResult;
    try {
      agentResult = await this.agentDispatcher.dispatch(
        task.fixSkill,
        task.branch,
        backendName,
        this.cwd
      );
    } catch (err) {
      return {
        taskId: task.id,
        startedAt,
        completedAt: new Date().toISOString(),
        status: 'failure',
        findings: checkResult.findings,
        fixed: 0,
        prUrl: null,
        prUpdated: false,
        error: `Agent dispatch failed: ${String(err)}`,
      };
    }

    let prUrl: string | null = null;
    let prUpdated = false;
    if (this.prManager && agentResult.producedCommits) {
      try {
        const summary = `Findings: ${checkResult.findings}, Fixed: ${agentResult.fixed}`;
        const prResult = await this.prManager.ensurePR(task, summary);
        prUrl = prResult.prUrl;
        prUpdated = prResult.prUpdated;
      } catch {
        // PR creation failed but agent work is preserved on branch — swallow to avoid discarding results
      }
    }

    return {
      taskId: task.id,
      startedAt,
      completedAt: new Date().toISOString(),
      status: 'success',
      findings: checkResult.findings,
      fixed: agentResult.fixed,
      prUrl,
      prUpdated,
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

    if (this.prManager) {
      try {
        await this.prManager.ensureBranch(task.branch, this.baseBranch);
      } catch (err) {
        return this.failureResult(task.id, startedAt, `ensureBranch failed: ${String(err)}`);
      }
    }

    const backendName = this.resolveBackend(task.id);
    let agentResult;
    try {
      agentResult = await this.agentDispatcher.dispatch(
        task.fixSkill,
        task.branch,
        backendName,
        this.cwd
      );
    } catch (err) {
      return this.failureResult(task.id, startedAt, `Agent dispatch failed: ${String(err)}`);
    }

    let prUrl: string | null = null;
    let prUpdated = false;
    if (this.prManager && agentResult.producedCommits) {
      try {
        const summary = `Fixed: ${agentResult.fixed}`;
        const prResult = await this.prManager.ensurePR(task, summary);
        prUrl = prResult.prUrl;
        prUpdated = prResult.prUpdated;
      } catch {
        // PR creation failed but agent work is preserved on branch — swallow to avoid discarding results
      }
    }

    return {
      taskId: task.id,
      startedAt,
      completedAt: new Date().toISOString(),
      status: agentResult.producedCommits ? 'success' : 'no-issues',
      findings: 0,
      fixed: agentResult.fixed,
      prUrl,
      prUpdated,
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
