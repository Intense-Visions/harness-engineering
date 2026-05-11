import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { WorkspaceManager } from '../../src/workspace/manager';

vi.mock('node:fs/promises');

/** Test subclass that stubs out git calls. */
class TestableWorkspaceManager extends WorkspaceManager {
  public gitCalls: Array<{ args: string[]; cwd: string }> = [];
  private gitImpl: (args: string[], cwd: string) => string = () => '';

  setGitImpl(impl: (args: string[], cwd: string) => string) {
    this.gitImpl = impl;
  }

  protected async git(args: string[], cwd: string): Promise<string> {
    this.gitCalls.push({ args, cwd });
    return this.gitImpl(args, cwd);
  }
}

describe('WorkspaceManager', () => {
  const config = { root: '/tmp/workspaces' };
  let manager: TestableWorkspaceManager;

  beforeEach(() => {
    vi.resetAllMocks();
    manager = new TestableWorkspaceManager(config);
    manager.setGitImpl((args) => {
      if (args[0] === 'rev-parse') return '/repo\n';
      return '';
    });
  });

  it('sanitizes identifier correctly', () => {
    expect(manager.sanitizeIdentifier('Issue-123')).toBe('issue-123');
    expect(manager.sanitizeIdentifier('feat/some-feature')).toBe('feat-some-feature');
    expect(manager.sanitizeIdentifier('../../etc/passwd')).toBe('etc-passwd');
  });

  it('resolves path within root', () => {
    const resolved = manager.resolvePath('issue-123');
    expect(resolved).toBe(path.join('/tmp/workspaces', 'issue-123'));
  });

  it('creates a git worktree for a new workspace', async () => {
    // .git check fails → workspace does not exist yet
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
    // readdir fails → no stale empty dir
    vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));

    const result = await manager.ensureWorkspace('test-issue');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(path.resolve('/tmp/workspaces', 'test-issue'));
    }

    // Should have called git worktree add
    const worktreeCall = manager.gitCalls.find(
      (c) => c.args[0] === 'worktree' && c.args[1] === 'add'
    );
    expect(worktreeCall).toBeDefined();
    expect(worktreeCall!.args).toContain('--detach');
    expect(worktreeCall!.cwd).toBe('/repo');
  });

  describe('base ref resolution', () => {
    beforeEach(() => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));
      vi.mocked(fs.readdir).mockRejectedValue(new Error('ENOENT'));
    });

    function worktreeAddRef(m: TestableWorkspaceManager): string | undefined {
      const call = m.gitCalls.find((c) => c.args[0] === 'worktree' && c.args[1] === 'add');
      // args: ['worktree', 'add', '--detach', <path>, <ref>]
      return call?.args[4];
    }

    it('uses origin/main by default when origin/HEAD points there', async () => {
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'symbolic-ref') return 'origin/main\n';
        return '';
      });

      await manager.ensureWorkspace('test-issue');
      expect(worktreeAddRef(manager)).toBe('origin/main');
    });

    it('bases the worktree on origin/main, NOT on the current HEAD', async () => {
      // Regression: with the old behavior, the agent worktree inherited the
      // user's currently-checked-out branch tip, causing agent-created PRs
      // to include all of that branch's commits as "changed".
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'symbolic-ref') return 'origin/main\n';
        return '';
      });

      await manager.ensureWorkspace('test-issue');
      expect(worktreeAddRef(manager)).not.toBe('HEAD');
    });

    it('honors an explicit workspace.baseRef when provided', async () => {
      const configured = new TestableWorkspaceManager({
        root: '/tmp/workspaces',
        baseRef: 'origin/release-candidate',
      });
      configured.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        // rev-parse --verify succeeds (returns empty) → ref exists
        return '';
      });

      await configured.ensureWorkspace('test-issue');
      expect(worktreeAddRef(configured)).toBe('origin/release-candidate');
    });

    it('throws when an explicit baseRef does not resolve', async () => {
      const configured = new TestableWorkspaceManager({
        root: '/tmp/workspaces',
        baseRef: 'origin/no-such-branch',
      });
      configured.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'rev-parse' && args[1] === '--verify') {
          throw new Error('fatal: Needed a single revision');
        }
        return '';
      });

      const result = await configured.ensureWorkspace('test-issue');
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.message).toContain('origin/no-such-branch');
      }
    });

    it('falls back through common defaults when origin/HEAD is not set', async () => {
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'symbolic-ref') {
          throw new Error('fatal: ref refs/remotes/origin/HEAD is not a symbolic ref');
        }
        // origin/main missing, origin/master exists
        if (args[0] === 'rev-parse' && args[1] === '--verify' && args[3] === 'origin/main') {
          throw new Error('not found');
        }
        if (args[0] === 'rev-parse' && args[1] === '--verify' && args[3] === 'origin/master') {
          return '';
        }
        return '';
      });

      await manager.ensureWorkspace('test-issue');
      expect(worktreeAddRef(manager)).toBe('origin/master');
    });

    it('ultimately falls back to HEAD when no default ref can be resolved', async () => {
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
        if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('missing');
        return '';
      });

      await manager.ensureWorkspace('test-issue');
      expect(worktreeAddRef(manager)).toBe('HEAD');
    });

    it('attempts a best-effort fetch before resolving the base ref', async () => {
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'symbolic-ref') return 'origin/main\n';
        return '';
      });

      await manager.ensureWorkspace('test-issue');
      const fetchCall = manager.gitCalls.find((c) => c.args[0] === 'fetch');
      expect(fetchCall).toBeDefined();
    });

    it('proceeds with local state when fetch fails (offline)', async () => {
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'fetch') throw new Error('fatal: unable to access remote');
        if (args[0] === 'symbolic-ref') return 'origin/main\n';
        return '';
      });

      const result = await manager.ensureWorkspace('test-issue');
      expect(result.ok).toBe(true);
      expect(worktreeAddRef(manager)).toBe('origin/main');
    });

    it('does not emit baseref_fallback by default (no emitter wired)', async () => {
      // Regression: the default WorkspaceManager construction in production
      // when no emitEvent is supplied must not throw or otherwise misbehave
      // on the local-only fallback path.
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'symbolic-ref') throw new Error('not symbolic');
        if (args[0] === 'rev-parse' && args[1] === '--verify') throw new Error('missing');
        return '';
      });

      const result = await manager.ensureWorkspace('test-issue');
      expect(result.ok).toBe(true);
      // The base ref ends up at 'HEAD' (existing behavior). The point of
      // this test is purely that no exception escaped from the (absent)
      // emitter path.
      expect(worktreeAddRef(manager)).toBe('HEAD');
    });
  });

  it('removes stale directory before creating worktree', async () => {
    // First access (.git check) rejects; second access (dir exists check) resolves
    vi.mocked(fs.access)
      .mockRejectedValueOnce(new Error('ENOENT'))
      .mockResolvedValueOnce(undefined);

    const result = await manager.ensureWorkspace('test-issue');
    expect(result.ok).toBe(true);
    // Should have called git worktree remove --force for the stale directory
    const removeCall = manager.gitCalls.find(
      (c) => c.args[0] === 'worktree' && c.args[1] === 'remove'
    );
    expect(removeCall).toBeDefined();
    expect(removeCall!.args).toContain('--force');
  });

  it('recreates worktree from latest base ref when stale worktree exists', async () => {
    // Regression: ensureWorkspace used to blindly reuse an existing worktree,
    // causing the orchestrator to dispatch agents on stale code after a restart.
    // The fix: remove the old worktree and create a fresh one from origin/main.

    // First call: .git check succeeds (worktree exists)
    // After removal: .git check fails (worktree gone), dir check fails (dir gone)
    let gitCheckCount = 0;
    vi.mocked(fs.access).mockImplementation(async (p) => {
      const pathStr = String(p);
      if (pathStr.endsWith('.git')) {
        gitCheckCount++;
        if (gitCheckCount === 1) return undefined; // First check: exists
        throw new Error('ENOENT'); // After removal: gone
      }
      throw new Error('ENOENT');
    });

    manager.setGitImpl((args) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
      if (args[0] === 'symbolic-ref') return 'origin/main\n';
      return '';
    });

    const result = await manager.ensureWorkspace('test-issue');
    expect(result.ok).toBe(true);

    // Must have removed the old worktree
    const removeCall = manager.gitCalls.find(
      (c) => c.args[0] === 'worktree' && c.args[1] === 'remove'
    );
    expect(removeCall).toBeDefined();

    // Must have created a fresh worktree from origin/main
    const addCall = manager.gitCalls.find((c) => c.args[0] === 'worktree' && c.args[1] === 'add');
    expect(addCall).toBeDefined();
    expect(addCall!.args).toContain('--detach');
    // The base ref should be origin/main, not whatever was in the old worktree
    expect(addCall!.args[4]).toBe('origin/main');
  });

  it('checks if workspace exists', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);
    const exists = await manager.exists('test-issue');
    expect(exists).toBe(true);
  });

  it('removes workspace via git worktree remove', async () => {
    const result = await manager.removeWorkspace('test-issue');
    expect(result.ok).toBe(true);

    const removeCall = manager.gitCalls.find(
      (c) => c.args[0] === 'worktree' && c.args[1] === 'remove'
    );
    expect(removeCall).toBeDefined();
  });

  it('creates workspace root directory before resolving repo root', async () => {
    // .git check fails → workspace does not exist yet
    vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

    const result = await manager.ensureWorkspace('test-issue');
    expect(result.ok).toBe(true);

    // getRepoRoot should have called fs.mkdir to ensure the workspace root exists
    expect(fs.mkdir).toHaveBeenCalledWith(path.resolve('/tmp/workspaces'), { recursive: true });
  });

  it('falls back to fs.rm if git worktree remove fails', async () => {
    vi.mocked(fs.rm).mockResolvedValue(undefined);
    manager.setGitImpl((args) => {
      if (args[0] === 'rev-parse') return '/repo\n';
      if (args[0] === 'worktree') throw new Error('not a worktree');
      return '';
    });

    const result = await manager.removeWorkspace('test-issue');
    expect(result.ok).toBe(true);
    expect(fs.rm).toHaveBeenCalled();
  });

  describe('findPushedBranch', () => {
    it('returns branch name when HEAD matches a remote branch', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'abc123\n';
        if (args[0] === 'for-each-ref') {
          return 'refs/remotes/origin/HEAD abc999\nrefs/remotes/origin/main def456\nrefs/remotes/origin/feat/my-feature abc123\n';
        }
        return '';
      });

      const branch = await manager.findPushedBranch('test-issue');
      expect(branch).toBe('feat/my-feature');
    });

    it('returns null when no remote branch matches HEAD', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'abc123\n';
        if (args[0] === 'for-each-ref') {
          return 'refs/remotes/origin/main def456\n';
        }
        return '';
      });

      const branch = await manager.findPushedBranch('test-issue');
      expect(branch).toBeNull();
    });

    it('returns null when worktree does not exist', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const branch = await manager.findPushedBranch('test-issue');
      expect(branch).toBeNull();
    });

    it('skips refs/remotes/origin/HEAD when matching', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'abc123\n';
        if (args[0] === 'for-each-ref') {
          return 'refs/remotes/origin/HEAD abc123\n';
        }
        return '';
      });

      const branch = await manager.findPushedBranch('test-issue');
      expect(branch).toBeNull();
    });

    it('skips origin/main and origin/master to avoid false positives on fresh worktrees', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'abc123\n';
        if (args[0] === 'for-each-ref') {
          return 'refs/remotes/origin/HEAD abc123\nrefs/remotes/origin/main abc123\nrefs/remotes/origin/master abc123\n';
        }
        return '';
      });

      const branch = await manager.findPushedBranch('test-issue');
      expect(branch).toBeNull();
    });

    it('skips branch names without a slash (positive-pattern validation)', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'abc123\n';
        if (args[0] === 'for-each-ref') {
          // A branch name without a slash — e.g. a symbolic ref that slipped past skip-list
          return 'refs/remotes/origin/develop abc123\nrefs/remotes/origin/staging abc123\n';
        }
        return '';
      });

      const branch = await manager.findPushedBranch('test-issue');
      expect(branch).toBeNull();
    });

    it('accepts branch names with a slash like feat/ or fix/', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'abc123\n';
        if (args[0] === 'for-each-ref') {
          return 'refs/remotes/origin/develop abc999\nrefs/remotes/origin/fix/my-bugfix abc123\n';
        }
        return '';
      });

      const branch = await manager.findPushedBranch('test-issue');
      expect(branch).toBe('fix/my-bugfix');
    });
  });

  describe('branchExistsOnRemote', () => {
    it('returns true when ls-remote finds the branch', async () => {
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'ls-remote') {
          return 'abc123\trefs/heads/feat/my-feature\n';
        }
        return '';
      });

      const exists = await manager.branchExistsOnRemote('feat/my-feature');
      expect(exists).toBe(true);
    });

    it('returns false when ls-remote returns empty', async () => {
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'ls-remote') return '\n';
        return '';
      });

      const exists = await manager.branchExistsOnRemote('feat/nonexistent');
      expect(exists).toBe(false);
    });

    it('returns false when git command fails', async () => {
      manager.setGitImpl((args) => {
        if (args[0] === 'ls-remote') throw new Error('network error');
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        return '';
      });

      const exists = await manager.branchExistsOnRemote('feat/broken');
      expect(exists).toBe(false);
    });
  });

  describe('sweepStaleBranches', () => {
    it('deletes old branches with merged PRs', async () => {
      const deletedBranches: string[] = [];
      const oldUnix = Math.floor(Date.now() / 1000) - 10 * 86400; // 10 days ago

      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'for-each-ref') {
          return `refs/remotes/origin/feat/old-feature ${oldUnix}\n`;
        }
        if (args[0] === 'push' && args[1] === 'origin' && args[2] === '--delete') {
          deletedBranches.push(args[3]!);
          return '';
        }
        return '';
      });

      const result = await manager.sweepStaleBranches({
        maxAgeDays: 7,
        checkPR: async () => ({ found: true }),
      });

      expect(result).toEqual(['feat/old-feature']);
      expect(deletedBranches).toEqual(['feat/old-feature']);
    });

    it('preserves recent branches even with merged PRs', async () => {
      const recentUnix = Math.floor(Date.now() / 1000) - 2 * 86400; // 2 days ago

      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'for-each-ref') {
          return `refs/remotes/origin/feat/recent-feature ${recentUnix}\n`;
        }
        return '';
      });

      const result = await manager.sweepStaleBranches({
        maxAgeDays: 7,
        checkPR: async () => ({ found: true }),
      });

      expect(result).toEqual([]);
    });

    it('preserves old branches without merged PRs', async () => {
      const oldUnix = Math.floor(Date.now() / 1000) - 10 * 86400;

      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'for-each-ref') {
          return `refs/remotes/origin/feat/no-pr-branch ${oldUnix}\n`;
        }
        return '';
      });

      const result = await manager.sweepStaleBranches({
        maxAgeDays: 7,
        checkPR: async () => ({ found: false }),
      });

      expect(result).toEqual([]);
    });

    it('preserves branches when PR check errors', async () => {
      const oldUnix = Math.floor(Date.now() / 1000) - 10 * 86400;

      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'for-each-ref') {
          return `refs/remotes/origin/feat/error-check ${oldUnix}\n`;
        }
        return '';
      });

      const result = await manager.sweepStaleBranches({
        maxAgeDays: 7,
        checkPR: async () => ({ found: false, error: 'network timeout' }),
      });

      expect(result).toEqual([]);
    });

    it('returns empty array when no remote branches exist', async () => {
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'for-each-ref') return '';
        return '';
      });

      const result = await manager.sweepStaleBranches({
        maxAgeDays: 7,
        checkPR: async () => ({ found: true }),
      });

      expect(result).toEqual([]);
    });
  });
});
