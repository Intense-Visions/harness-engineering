import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WorkspaceConfig, Result, Ok, Err } from '@harness-engineering/types';

export class WorkspaceManager {
  private config: WorkspaceConfig;
  /** Absolute path to the git repository root (resolved lazily). */
  private repoRoot: string | null = null;

  constructor(config: WorkspaceConfig) {
    this.config = config;
  }

  /** Runs a git command and returns stdout. Extracted for testability. */
  protected async git(args: string[], cwd: string): Promise<string> {
    const exec = promisify(execFile);
    const { stdout } = await exec('git', args, { cwd });
    return stdout;
  }

  /**
   * Sanitizes an issue identifier to be safe for use as a directory name.
   */
  public sanitizeIdentifier(identifier: string): string {
    return identifier
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
  }

  /**
   * Resolves the full path for an issue's workspace.
   */
  public resolvePath(identifier: string): string {
    const sanitized = this.sanitizeIdentifier(identifier);
    return path.join(this.config.root, sanitized);
  }

  /**
   * Discovers the git repository root from the workspace root directory.
   */
  private async getRepoRoot(): Promise<string> {
    if (this.repoRoot) return this.repoRoot;
    const stdout = await this.git(['rev-parse', '--show-toplevel'], path.resolve(this.config.root));
    this.repoRoot = stdout.trim();
    return this.repoRoot;
  }

  /**
   * Ensures the workspace exists as a git worktree so the agent has
   * access to the full project source.
   */
  public async ensureWorkspace(identifier: string): Promise<Result<string, Error>> {
    try {
      const workspacePath = path.resolve(this.resolvePath(identifier));

      // If the worktree already exists (e.g. resumed session), reuse it.
      try {
        await fs.access(path.join(workspacePath, '.git'));
        return Ok(workspacePath);
      } catch {
        // Not yet created — fall through to create it.
      }

      // Remove stale empty directory if a previous run left one behind.
      try {
        const entries = await fs.readdir(workspacePath);
        if (entries.length === 0) {
          await fs.rmdir(workspacePath);
        }
      } catch {
        // Directory doesn't exist — that's fine.
      }

      const repoRoot = await this.getRepoRoot();

      // Create the worktree from HEAD in detached mode so we don't
      // collide with checked-out branches.
      await this.git(['worktree', 'add', '--detach', workspacePath, 'HEAD'], repoRoot);

      return Ok(workspacePath);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Checks if a workspace exists.
   */
  public async exists(identifier: string): Promise<boolean> {
    try {
      const workspacePath = this.resolvePath(identifier);
      await fs.access(workspacePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Removes a workspace directory and its git worktree registration.
   */
  public async removeWorkspace(identifier: string): Promise<Result<void, Error>> {
    try {
      const workspacePath = path.resolve(this.resolvePath(identifier));

      // Try to remove via git worktree first (cleans up .git/worktrees entry).
      try {
        const repoRoot = await this.getRepoRoot();
        await this.git(['worktree', 'remove', '--force', workspacePath], repoRoot);
      } catch {
        // If git worktree remove fails (not a worktree, already removed, etc.),
        // fall back to plain directory removal.
        await fs.rm(workspacePath, { recursive: true, force: true });
      }

      return Ok(undefined);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
