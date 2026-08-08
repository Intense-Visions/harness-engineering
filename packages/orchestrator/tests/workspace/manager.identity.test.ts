import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { WorkspaceManager } from '../../src/workspace/manager';

/** Stubs git so getRepoRoot() returns our temp repo root; no real git/fs mocking. */
class TestableWorkspaceManager extends WorkspaceManager {
  constructor(
    root: string,
    private repo: string
  ) {
    super({ root });
  }
  protected async git(args: string[]): Promise<string> {
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return `${this.repo}\n`;
    return '';
  }
}

describe('WorkspaceManager — worktree identity', () => {
  let repoRoot: string;
  let manager: TestableWorkspaceManager;

  beforeEach(() => {
    repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-identity-test-'));
    manager = new TestableWorkspaceManager(path.join(repoRoot, 'workspaces'), repoRoot);
  });
  afterEach(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  it('getWorkspaceIdentity returns null before any record exists', async () => {
    expect(await manager.getWorkspaceIdentity('issue-1')).toBeNull();
  });

  it('records an immutable worktree identity and assigns a completion number', async () => {
    // assignWorkspaceNumber with no identity → null (best-effort).
    expect(await manager.assignWorkspaceNumber('issue-1')).toBeNull();

    // Seed a record via the store the same way ensureWorkspace does.
    const { ensureIdentity } = await import('@harness-engineering/core');
    ensureIdentity(path.join(repoRoot, '.harness', 'worktrees', 'issue-1.json'), {
      slug: 'issue-1',
      domain: 'worktree',
    });

    const id = await manager.getWorkspaceIdentity('issue-1');
    expect(id).not.toBeNull();
    expect(id!.domain).toBe('worktree');
    expect(id!.slug).toBe('issue-1');
    expect(id!.number).toBeNull();
    const ulid1 = id!.ulid;

    // Re-ensure is immutable.
    ensureIdentity(path.join(repoRoot, '.harness', 'worktrees', 'issue-1.json'), {
      slug: 'renamed',
      domain: 'worktree',
    });
    expect((await manager.getWorkspaceIdentity('issue-1'))!.ulid).toBe(ulid1);

    // assignWorkspaceNumber allocates 1 and is idempotent.
    expect((await manager.assignWorkspaceNumber('issue-1'))!.number).toBe(1);
    expect((await manager.assignWorkspaceNumber('issue-1'))!.number).toBe(1);
  });

  it('sanitized identifier drives the record filename', async () => {
    const { ensureIdentity } = await import('@harness-engineering/core');
    const sanitized = manager.sanitizeIdentifier('feat/Some Thing');
    ensureIdentity(path.join(repoRoot, '.harness', 'worktrees', `${sanitized}.json`), {
      slug: sanitized,
      domain: 'worktree',
    });
    const id = await manager.getWorkspaceIdentity('feat/Some Thing');
    expect(id).not.toBeNull();
    expect(id!.slug).toBe(sanitized);
  });
});
