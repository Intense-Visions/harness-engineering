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
    const worktreeCall = manager.gitCalls.find((c) => c.args[0] === 'worktree');
    expect(worktreeCall).toBeDefined();
    expect(worktreeCall!.args).toContain('--detach');
    expect(worktreeCall!.cwd).toBe('/repo');
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
});
