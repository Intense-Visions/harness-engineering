import type { TaskDefinition } from './types';

/**
 * Interface for executing git commands. Injected for testability.
 */
export interface GitExecutor {
  /** Run a git command and return stdout. Throws on non-zero exit. */
  run(args: string[], cwd: string): Promise<string>;
}

/**
 * Interface for executing gh CLI commands. Injected for testability.
 */
export interface GhExecutor {
  /**
   * Run a gh command and return stdout. Throws on non-zero exit.
   * Implementation MUST use execFile/spawn (array args), not exec (string),
   * to prevent shell metacharacter injection from PR body content.
   */
  run(args: string[], cwd: string): Promise<string>;
}

export interface EnsureBranchResult {
  /** True if the branch was newly created (did not exist remotely). */
  created: boolean;
  /** True if the branch existed but was recreated due to rebase conflict. */
  recreated: boolean;
}

export interface EnsurePRResult {
  /** URL of the PR (created or existing). */
  prUrl: string;
  /** True if an existing PR was updated, false if newly created. */
  prUpdated: boolean;
}

export interface PRManagerOptions {
  git: GitExecutor;
  gh: GhExecutor;
  /** Project root directory for running commands. */
  cwd: string;
  /** Logger for debug/info messages. */
  logger: PRManagerLogger;
}

/** @deprecated Use MaintenanceLogger from scheduler.ts instead */
export interface PRManagerLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error?(message: string, context?: Record<string, unknown>): void;
  debug?(message: string, context?: Record<string, unknown>): void;
}

/**
 * PRManager handles branch lifecycle (create, fetch, rebase, recreate)
 * and PR lifecycle (create or update via gh CLI) for maintenance tasks.
 */
export class PRManager {
  private git: GitExecutor;
  private gh: GhExecutor;
  private cwd: string;
  private logger: PRManagerLogger;

  constructor(options: PRManagerOptions) {
    this.git = options.git;
    this.gh = options.gh;
    this.cwd = options.cwd;
    this.logger = options.logger;
  }

  /**
   * Ensure a maintenance branch exists and is up-to-date with the base branch.
   *
   * - If the branch does not exist remotely: create from baseBranch.
   * - If it exists: fetch, checkout, attempt rebase onto baseBranch.
   * - If rebase fails: abort rebase, delete branch, recreate from baseBranch.
   */
  async ensureBranch(branchName: string, baseBranch: string): Promise<EnsureBranchResult> {
    const remoteExists = await this.remoteBranchExists(branchName);

    if (!remoteExists) {
      this.logger.info('Creating new maintenance branch', { branchName, baseBranch });
      await this.git.run(['fetch', 'origin', baseBranch], this.cwd);
      await this.git.run(['checkout', '-b', branchName, `origin/${baseBranch}`], this.cwd);
      return { created: true, recreated: false };
    }

    // Branch exists remotely -- fetch and checkout
    this.logger.info('Fetching existing maintenance branch', { branchName });
    await this.git.run(['fetch', 'origin', branchName], this.cwd);
    await this.git.run(['checkout', branchName], this.cwd);
    await this.git.run(['reset', '--hard', `origin/${branchName}`], this.cwd);

    // Attempt rebase onto base branch
    await this.git.run(['fetch', 'origin', baseBranch], this.cwd);
    const rebaseSucceeded = await this.tryRebase(baseBranch);

    if (rebaseSucceeded) {
      return { created: false, recreated: false };
    }

    // Rebase failed -- recreate branch
    this.logger.warn('Rebase failed, recreating branch from base', { branchName, baseBranch });
    try {
      await this.git.run(['rebase', '--abort'], this.cwd);
    } catch {
      // rebase --abort can fail if no rebase in progress; recover via reset
      try {
        await this.git.run(['reset', '--hard'], this.cwd);
      } catch {
        // best-effort recovery
      }
    }
    await this.git.run(['checkout', `origin/${baseBranch}`], this.cwd);
    await this.git.run(['branch', '-D', branchName], this.cwd);
    // Also delete the remote branch so we start fresh
    try {
      await this.git.run(['push', 'origin', '--delete', branchName], this.cwd);
    } catch {
      // Remote branch may already be gone; ignore
    }
    await this.git.run(['checkout', '-b', branchName, `origin/${baseBranch}`], this.cwd);
    return { created: false, recreated: true };
  }

  /**
   * Ensure a PR exists for the maintenance task's branch.
   *
   * - Push current commits to origin.
   * - If a PR already exists: update its body via gh pr edit.
   * - If no PR exists: create one via gh pr create.
   */
  async ensurePR(task: TaskDefinition, runSummary: string): Promise<EnsurePRResult> {
    if (!task.branch) {
      throw new Error(`ensurePR requires task.branch to be set (task: ${task.id})`);
    }
    const branchName = task.branch;

    // Push commits to remote
    await this.git.run(['push', 'origin', branchName, '--force-with-lease'], this.cwd);

    // Check for existing PR
    const existingPrUrl = await this.findOpenPR(branchName);

    if (existingPrUrl) {
      this.logger.info('Updating existing maintenance PR', { branchName, prUrl: existingPrUrl });
      await this.gh.run(
        ['pr', 'edit', existingPrUrl, '--body', this.buildPRBody(task, runSummary)],
        this.cwd
      );
      return { prUrl: existingPrUrl, prUpdated: true };
    }

    // Create new PR
    this.logger.info('Creating new maintenance PR', { branchName });
    const title = `[Maintenance] ${task.description}`;
    const body = this.buildPRBody(task, runSummary);
    const prUrl = (
      await this.gh.run(
        [
          'pr',
          'create',
          '--head',
          branchName,
          '--title',
          title,
          '--body',
          body,
          '--label',
          'harness-maintenance',
          '--label',
          task.id,
        ],
        this.cwd
      )
    ).trim();

    return { prUrl, prUpdated: false };
  }

  /**
   * Check if a remote branch exists using git ls-remote.
   */
  private async remoteBranchExists(branchName: string): Promise<boolean> {
    try {
      const output = await this.git.run(
        ['ls-remote', '--heads', 'origin', `refs/heads/${branchName}`],
        this.cwd
      );
      return output.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Attempt to rebase current branch onto baseBranch.
   * Returns true if rebase succeeded, false if conflicts arose.
   */
  private async tryRebase(baseBranch: string): Promise<boolean> {
    try {
      await this.git.run(['rebase', `origin/${baseBranch}`], this.cwd);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Find an open PR for the given branch head.
   * Returns the PR URL if found, null otherwise.
   */
  private async findOpenPR(branchName: string): Promise<string | null> {
    try {
      const output = await this.gh.run(
        ['pr', 'list', '--head', branchName, '--json', 'url', '--jq', '.[0].url'],
        this.cwd
      );
      const url = output.trim();
      return url.length > 0 ? url : null;
    } catch {
      return null;
    }
  }

  /**
   * Build the PR body with task metadata and run summary.
   */
  private buildPRBody(task: TaskDefinition, runSummary: string): string {
    const lines = [
      '## Automated Maintenance PR',
      '',
      `**Task:** ${task.id}`,
      `**Type:** ${task.type}`,
      `**Schedule:** \`${task.schedule}\``,
      '',
      '## Latest Run Summary',
      '',
      runSummary,
      '',
      '---',
      '_This PR was created and managed automatically by the harness maintenance scheduler._',
    ];
    return lines.join('\n');
  }
}
