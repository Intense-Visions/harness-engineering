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
    // Ensure the workspace root exists before using it as cwd for git.
    // On a fresh machine the directory may not have been created yet,
    // and execFile throws a misleading ENOENT ("spawn git ENOENT") when
    // the cwd doesn't exist.
    const root = path.resolve(this.config.root);
    await fs.mkdir(root, { recursive: true });
    const stdout = await this.git(['rev-parse', '--show-toplevel'], root);
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

      // Remove any existing worktree so the agent always starts from the
      // latest base ref. Previously this path reused stale worktrees which
      // caused agents to work on outdated code after an orchestrator restart.
      try {
        await fs.access(path.join(workspacePath, '.git'));
        // Valid worktree exists — remove it so we recreate from latest base.
        const repoRoot = await this.getRepoRoot();
        try {
          await this.git(['worktree', 'remove', '--force', workspacePath], repoRoot);
        } catch {
          await fs.rm(workspacePath, { recursive: true, force: true });
        }
      } catch {
        // No .git marker — check for a stale directory from a partial run.
        try {
          await fs.access(workspacePath);
          const repoRoot = await this.getRepoRoot();
          try {
            await this.git(['worktree', 'remove', '--force', workspacePath], repoRoot);
          } catch {
            await fs.rm(workspacePath, { recursive: true, force: true });
          }
        } catch {
          // Directory doesn't exist — that's fine.
        }
      }

      const repoRoot = await this.getRepoRoot();

      // Best-effort fetch so origin/<default> reflects the latest remote
      // state. Silent on failure so offline / no-remote setups still work.
      await this.tryFetch(repoRoot);

      // Resolve the base ref (configured → auto-detected → fallbacks). We
      // create the worktree in detached mode so it can't collide with a
      // branch that is already checked out elsewhere.
      const baseRef = await this.resolveBaseRef(repoRoot);
      await this.git(['worktree', 'add', '--detach', workspacePath, baseRef], repoRoot);

      return Ok(workspacePath);
    } catch (error) {
      return Err(error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Best-effort `git fetch origin` so subsequent ref resolution sees the
   * latest remote state. Failures (offline, no remote, auth errors) are
   * swallowed — dispatch should not be blocked by transient network issues.
   */
  private async tryFetch(repoRoot: string): Promise<void> {
    try {
      await this.git(['fetch', 'origin', '--quiet'], repoRoot);
    } catch {
      // Intentional: proceed with whatever refs already exist locally.
    }
  }

  /**
   * Resolves the ref that new worktrees should be based on.
   *
   * Priority order:
   *   1. `config.baseRef` (explicit override). Throws if it doesn't resolve.
   *   2. Default branch via `git symbolic-ref --short refs/remotes/origin/HEAD`.
   *   3. Common fallbacks: `origin/main`, `origin/master`, `main`, `master`.
   *   4. `HEAD` as an ultimate fallback (preserves old behavior for unusual
   *      repos without any of the above).
   */
  private async resolveBaseRef(repoRoot: string): Promise<string> {
    const configured = this.config.baseRef;
    if (configured) {
      if (await this.refExists(configured, repoRoot)) return configured;
      throw new Error(
        `Configured workspace.baseRef "${configured}" does not resolve in this repository`
      );
    }

    try {
      const stdout = await this.git(
        ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
        repoRoot
      );
      const detected = stdout.trim();
      if (detected) return detected;
    } catch {
      // origin/HEAD not set — fall through to known-name lookups.
    }

    for (const candidate of ['origin/main', 'origin/master', 'main', 'master']) {
      if (await this.refExists(candidate, repoRoot)) return candidate;
    }

    return 'HEAD';
  }

  /** Returns true iff `git rev-parse --verify` accepts the ref. */
  private async refExists(ref: string, repoRoot: string): Promise<boolean> {
    try {
      await this.git(['rev-parse', '--verify', '--quiet', ref], repoRoot);
      return true;
    } catch {
      return false;
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
   * Checks whether a worktree has commits ahead of the base branch that have
   * been pushed to a remote branch. Returns the remote branch name if found,
   * or null if the worktree is on a detached HEAD with no pushed branch.
   */
  public async findPushedBranch(identifier: string): Promise<string | null> {
    try {
      const workspacePath = path.resolve(this.resolvePath(identifier));
      try {
        await fs.access(path.join(workspacePath, '.git'));
      } catch {
        return null;
      }

      // In detached HEAD worktrees the agent creates and pushes a branch.
      // Detect it by looking for remote branches whose tip matches HEAD.
      // We use %(refname) (full) instead of %(refname:short) because the short
      // form of refs/remotes/origin/HEAD is "origin" — not "origin/HEAD" — which
      // defeats the skip check and can be mistaken for a real branch.
      const head = (await this.git(['rev-parse', 'HEAD'], workspacePath)).trim();
      const refs = (
        await this.git(
          ['for-each-ref', '--format=%(refname) %(objectname)', 'refs/remotes/origin/'],
          workspacePath
        )
      ).trim();

      if (!refs) return null;

      const PREFIX = 'refs/remotes/origin/';
      for (const line of refs.split('\n')) {
        const spaceIdx = line.indexOf(' ');
        if (spaceIdx < 0) continue;
        const refName = line.slice(0, spaceIdx);
        const sha = line.slice(spaceIdx + 1);
        if (!refName || !sha) continue;
        // Skip the symbolic HEAD pointer and default branches — these match
        // HEAD on freshly-created worktrees and are never agent-pushed branches.
        const short = refName.startsWith(PREFIX) ? refName.slice(PREFIX.length) : refName;
        if (short === 'HEAD' || short === 'main' || short === 'master') continue;
        if (sha === head) {
          return short;
        }
      }

      return null;
    } catch {
      return null;
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
