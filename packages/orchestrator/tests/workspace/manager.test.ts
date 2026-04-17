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

  it('reuses existing worktree when .git is present', async () => {
    vi.mocked(fs.access).mockResolvedValue(undefined);

    const result = await manager.ensureWorkspace('test-issue');
    expect(result.ok).toBe(true);
    // Should not have called git at all
    expect(manager.gitCalls).toHaveLength(0);
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
          return 'origin/HEAD abc999\norigin/main def456\norigin/feat/my-feature abc123\n';
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
          return 'origin/main def456\n';
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

    it('skips origin/HEAD when matching', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);
      manager.setGitImpl((args) => {
        if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
        if (args[0] === 'rev-parse' && args[1] === 'HEAD') return 'abc123\n';
        if (args[0] === 'for-each-ref') {
          return 'origin/HEAD abc123\n';
        }
        return '';
      });

      const branch = await manager.findPushedBranch('test-issue');
      expect(branch).toBeNull();
    });
  });
});
