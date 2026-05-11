import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { WorkspaceConfig, Result, Ok, Err } from '@harness-engineering/types';

/**
 * Structured event emitted when {@link WorkspaceManager.resolveBaseRef}
 * falls back past `origin/HEAD` and `origin/main`/`origin/master` to a
 * local-only ref. Operators see this in the dashboard's maintenance
 * event stream when the remote is misconfigured or unreachable.
 */
export interface BaseRefFallbackEvent {
  kind: 'baseref_fallback';
  /** The ref that was selected — `'main'`, `'master'`, or `'HEAD'`. */
  ref: string;
  /** Absolute path to the git repository root. */
  repoRoot: string;
}

/** Optional dependencies injected into {@link WorkspaceManager}. */
export interface WorkspaceManagerOptions {
  /**
   * Synchronous fire-and-forget callback invoked when {@link
   * WorkspaceManager.resolveBaseRef} falls back to a local-only ref.
   * When omitted, fallback emission is silently skipped.
   */
  emitEvent?: (event: BaseRefFallbackEvent) => void;
}

export class WorkspaceManager {
  private config: WorkspaceConfig;
  /** Absolute path to the git repository root (resolved lazily). */
  private repoRoot: string | null = null;
  /** Phase 3 (D6): emit baseref_fallback when fallback chain selects a local-only ref. */
  private emitEvent: ((event: BaseRefFallbackEvent) => void) | null;

  constructor(config: WorkspaceConfig, options: WorkspaceManagerOptions = {}) {
    this.config = config;
    this.emitEvent = options.emitEvent ?? null;
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
   *   3. Remote fallbacks: `origin/main`, `origin/master`. (No event.)
   *   4. Local-only fallbacks: `main`, `master`. (Emits `baseref_fallback`.)
   *   5. `HEAD` as ultimate fallback. (Emits `baseref_fallback`.)
   *
   * Phase 3 / spec D6 / R4: when the priority chain falls past `origin/*`
   * to a local-only ref, the optional `emitEvent` callback (if injected)
   * is invoked exactly once with `{ kind: 'baseref_fallback', ref, repoRoot }`
   * so operators are warned when the remote is misconfigured or unreachable.
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

    // origin/* candidates are NOT fallbacks worth warning about — they
    // still ground the worktree on a remote tracking ref.
    for (const candidate of ['origin/main', 'origin/master']) {
      if (await this.refExists(candidate, repoRoot)) return candidate;
    }

    // Local-only candidates ARE worth warning about. Per spec D6, falling
    // past origin/* nearly always means the remote is misconfigured or
    // unreachable; the operator should know rather than have the
    // orchestrator silently dispatch agents from a local-only ref.
    for (const candidate of ['main', 'master']) {
      if (await this.refExists(candidate, repoRoot)) {
        this.emitFallback(candidate, repoRoot);
        return candidate;
      }
    }

    this.emitFallback('HEAD', repoRoot);
    return 'HEAD';
  }

  /**
   * Phase 3 (D6): emit a `baseref_fallback` event via the injected
   * callback (if any). Errors from the callback are swallowed so a
   * broken emitter does not block worktree dispatch.
   */
  private emitFallback(ref: string, repoRoot: string): void {
    if (!this.emitEvent) return;
    try {
      this.emitEvent({ kind: 'baseref_fallback', ref, repoRoot });
    } catch {
      // emitEvent must never block worktree creation. Swallow errors —
      // a broken emitter shouldn't take down dispatch.
    }
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
        // Agent-pushed branches always use a prefix with a slash (e.g. feat/..., fix/...).
        // Reject anything without a slash to catch symbolic refs or other non-agent branches
        // that slip past the skip-list above.
        if (!short.includes('/')) continue;
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
   * Checks whether a branch exists on the remote by querying `git ls-remote`.
   * Returns false if the branch is not found or the command fails.
   */
  public async branchExistsOnRemote(branch: string): Promise<boolean> {
    try {
      const repoRoot = await this.getRepoRoot();
      const result = await this.git(['ls-remote', '--heads', 'origin', branch], repoRoot);
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Deletes remote branches whose PRs are merged and that are older than
   * `maxAgeDays`. Only considers branches matching agent naming conventions
   * (feat/*, fix/*). Returns the list of deleted branch names.
   *
   * Requires a `checkPR` callback so this class doesn't depend on PRDetector
   * directly. The orchestrator wires this up at call time.
   */
  public async sweepStaleBranches(opts: {
    maxAgeDays: number;
    checkPR: (branch: string) => Promise<{ found: boolean; error?: string }>;
  }): Promise<string[]> {
    const deleted: string[] = [];
    try {
      const repoRoot = await this.getRepoRoot();
      const refs = (
        await this.git(
          [
            'for-each-ref',
            '--format=%(refname) %(committerdate:unix)',
            'refs/remotes/origin/feat/',
            'refs/remotes/origin/fix/',
          ],
          repoRoot
        )
      ).trim();

      if (!refs) return deleted;

      const PREFIX = 'refs/remotes/origin/';
      const cutoffUnix = Date.now() / 1000 - opts.maxAgeDays * 86400;
      const candidates: Array<{ short: string; age: number }> = [];

      for (const line of refs.split('\n')) {
        const spaceIdx = line.lastIndexOf(' ');
        if (spaceIdx < 0) continue;
        const refName = line.slice(0, spaceIdx);
        const unixStr = line.slice(spaceIdx + 1);
        const unix = parseInt(unixStr, 10);
        if (isNaN(unix) || unix > cutoffUnix) continue;
        const short = refName.startsWith(PREFIX) ? refName.slice(PREFIX.length) : refName;
        candidates.push({ short, age: unix });
      }

      // Throttle to 3 concurrent gh CLI calls
      const concurrency = 3;
      for (let i = 0; i < candidates.length; i += concurrency) {
        const batch = candidates.slice(i, i + concurrency);
        const results = await Promise.allSettled(
          batch.map(async ({ short }) => {
            const pr = await opts.checkPR(short);
            return { short, pr };
          })
        );
        for (const result of results) {
          if (result.status !== 'fulfilled') continue;
          const { short, pr } = result.value;
          if (!pr.found || pr.error) continue;
          // PR exists and was found without error — safe to delete the remote branch
          try {
            await this.git(['push', 'origin', '--delete', short], repoRoot);
            deleted.push(short);
          } catch {
            // Deletion failed (permissions, already deleted, etc.) — skip
          }
        }
      }
    } catch {
      // Sweep is best-effort; don't fail the tick
    }
    return deleted;
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
