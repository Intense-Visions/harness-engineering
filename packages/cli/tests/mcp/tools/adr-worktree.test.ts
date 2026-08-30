import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { handleManageAdr } from '../../../src/mcp/tools/adr';
import { resolveWorktreeRoot } from '../../../src/mcp/tools/adr-store';

/**
 * Regression test for #1507: `manage_adr` must be git-worktree-aware.
 *
 * Before the fix the handler wrote ADRs to `input.path` (the MCP server's launch
 * root), so an ADR authored while working inside a `git worktree` landed in the
 * WRONG checkout. The fix (F2) resolves the active worktree via
 * `git rev-parse --show-toplevel` from the caller's cwd and writes there.
 */

let mainRepo: string;
let worktree: string;

function git(cwd: string, ...args: string[]): void {
  execFileSync('git', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
}

const decisionsRel = path.join('docs', 'knowledge', 'decisions');

function decisionFiles(root: string): string[] {
  const dir = path.join(root, decisionsRel);
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  } catch {
    return [];
  }
}

beforeEach(() => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-wt-'));
  mainRepo = path.join(base, 'main');
  fs.mkdirSync(mainRepo, { recursive: true });
  git(mainRepo, 'init', '-b', 'main');
  git(mainRepo, 'config', 'user.email', 'test@example.com');
  git(mainRepo, 'config', 'user.name', 'Test');
  fs.writeFileSync(path.join(mainRepo, 'README.md'), '# main\n');
  git(mainRepo, 'add', '.');
  git(mainRepo, 'commit', '-m', 'init');

  // A sibling worktree on its own branch — the checkout the caller works in.
  worktree = path.join(base, 'wt');
  git(mainRepo, 'worktree', 'add', '-b', 'feature', worktree, 'HEAD');
});

afterEach(() => {
  // Remove the whole temp base (parent of both mainRepo and worktree).
  fs.rmSync(path.dirname(mainRepo), { recursive: true, force: true });
});

describe('manage_adr git-worktree awareness (#1507)', () => {
  it('resolveWorktreeRoot resolves the worktree top-level from its cwd, not the server root', () => {
    // realpathSync.native canonicalizes both macOS /var -> /private/var symlinks
    // AND Windows 8.3 short names (RUNNER~1) -> long names (runneradmin), which
    // `git rev-parse --show-toplevel` emits but os.tmpdir()/mkdtemp does not.
    const canon = (p: string): string => fs.realpathSync.native(p);
    const resolved = resolveWorktreeRoot(worktree, mainRepo);
    expect(canon(resolved)).toBe(canon(worktree));
    expect(canon(resolved)).not.toBe(canon(mainRepo));
  });

  it('writes a created ADR into the active worktree, not the server projectRoot', async () => {
    // `path` is the server launch root (main repo); cwd is the active worktree.
    const resp = await handleManageAdr(
      {
        path: mainRepo,
        action: 'create',
        title: 'Worktree Aware ADR',
        context: 'Authored from a git worktree.',
        decision: 'ADRs must land in the active worktree.',
        consequences: 'No more polluting the main checkout.',
      },
      worktree
    );

    expect(resp.isError).toBeFalsy();
    // The ADR lands in the worktree...
    expect(decisionFiles(worktree)).toHaveLength(1);
    expect(decisionFiles(worktree)[0]).toMatch(/^0001-worktree-aware-adr\.md$/);
    // ...and NOT in the server's projectRoot.
    expect(decisionFiles(mainRepo)).toHaveLength(0);
  });

  it('falls back to the supplied projectRoot when cwd is not inside a git repo', async () => {
    const nonGit = fs.mkdtempSync(path.join(os.tmpdir(), 'adr-nogit-'));
    try {
      const resp = await handleManageAdr(
        {
          path: mainRepo,
          action: 'create',
          title: 'Fallback ADR',
          context: 'ctx',
          decision: 'dec',
          consequences: 'cons',
        },
        nonGit
      );
      expect(resp.isError).toBeFalsy();
      // cwd is not a git repo -> fall back to the supplied root (main repo).
      expect(decisionFiles(mainRepo)).toHaveLength(1);
      expect(decisionFiles(nonGit)).toHaveLength(0);
    } finally {
      fs.rmSync(nonGit, { recursive: true, force: true });
    }
  });
});
