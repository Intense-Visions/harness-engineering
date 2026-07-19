import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { WorkspaceManager } from './manager';
import type { WorkspaceConfig } from '@harness-engineering/types';

/**
 * staged-verify-gate-convergence D4 — `WorkspaceManager.shipWorkspace` turns a
 * detached-HEAD worktree with UNCOMMITTED accumulated work into a pushed branch +
 * PR, deterministically, so `cleanWorkspaceWithGuard` finds the pushed branch and
 * takes its preserve/record path (the PR-merge then auto-dones the roadmap row —
 * the loop stops). The `git`/`gh` seams are overridden (their documented test
 * hooks); the method must be fully guarded — every step that fails returns `Err`
 * (never throws out), so the caller can treat a ship failure as a BLOCK.
 */

const config = (over: Partial<WorkspaceConfig> = {}): WorkspaceConfig =>
  ({ root: '/tmp/ws', baseRef: 'origin/main', ...over }) as WorkspaceConfig;

/** Records the git/gh command sequence; each command is stubbable per-args. */
class ShipStubWM extends WorkspaceManager {
  public readonly gitCalls: string[][] = [];
  public readonly ghCalls: string[][] = [];
  /** Args whose invocation should throw (simulating a failed step). */
  public failGit: (args: string[]) => boolean = () => false;
  public failGh: (args: string[]) => boolean = () => false;
  /** Reported working-tree dirtiness for the `status --porcelain` probe. */
  public statusOutput = ' M src/rule.ts\n';
  /**
   * Idempotency probes (default: nothing pre-exists ⇒ the fresh create-and-ship
   * path, so the non-resumable tests are unchanged). Set true to model a partial
   * prior ship: `localBranchExists` ⇒ `git switch` without `-c`; `remoteBranchExists`
   * ⇒ push is skipped; `openPrExists` ⇒ ship is ALREADY DONE (no duplicate PR).
   */
  public localBranchExists = false;
  public remoteBranchExists = false;
  public openPrExists = false;
  /** Number of times `gh pr create` should throw before succeeding (push→PR race). */
  public ghCreateFailuresBeforeSuccess = 0;

  /** No-op backoff so the retry loop doesn't actually wait in tests. */
  protected async sleep(): Promise<void> {}

  protected async git(args: string[], _cwd: string): Promise<string> {
    this.gitCalls.push(args);
    if (this.failGit(args)) throw new Error(`git ${args.join(' ')} failed`);
    if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return '/repo\n';
    if (args[0] === 'status') return this.statusOutput;
    // Local-branch existence probe: `git rev-parse --verify --quiet refs/heads/<b>`.
    // Non-throwing ⇒ exists; throw ⇒ absent (mirrors real git's exit-1 on a
    // missing ref). Default absent so the fresh-ship tests keep taking `switch -c`.
    if (
      args[0] === 'rev-parse' &&
      args.includes('--verify') &&
      // `refs/heads/` is a git ref namespace, not a filesystem path.
      // eslint-disable-next-line @harness-engineering/no-hardcoded-path-separator
      args.some((a) => a.startsWith('refs/heads/'))
    ) {
      if (!this.localBranchExists) throw new Error('unknown revision');
      return 'sha\n';
    }
    // Remote-branch existence probe: `git ls-remote --heads origin <b>`. Empty
    // output ⇒ absent (default). Non-empty ⇒ pushed.
    if (args[0] === 'ls-remote') {
      return this.remoteBranchExists ? 'sha\trefs/heads/orchestrator/iss-1\n' : '';
    }
    return 'ok\n';
  }

  protected async gh(args: string[], _cwd: string): Promise<string> {
    this.ghCalls.push(args);
    if (this.failGh(args)) throw new Error(`gh ${args.join(' ')} failed`);
    // PR-existence probe: `gh pr list --head <b> --state open`. Empty ⇒ no PR
    // (default). Non-empty JSON ⇒ an open PR already covers the branch.
    if (args[0] === 'pr' && args[1] === 'list') {
      return this.openPrExists ? '[{"url":"https://github.com/o/r/pull/42"}]\n' : '[]\n';
    }
    if (args[0] === 'pr' && args[1] === 'create' && this.ghCreateFailuresBeforeSuccess > 0) {
      this.ghCreateFailuresBeforeSuccess--;
      throw new Error('gh pr create failed: No commits between main and orchestrator/iss-1');
    }
    return 'https://github.com/o/r/pull/42\n';
  }
}

describe('WorkspaceManager.shipWorkspace (D4)', () => {
  it('retries gh pr create through a transient push→PR race and still returns the prUrl', async () => {
    const wm = new ShipStubWM(config());
    wm.ghCreateFailuresBeforeSuccess = 2; // fail twice, succeed on the third attempt
    const result = await wm.shipWorkspace('ISS-1', { title: 't', body: 'b' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.prUrl).toBe('https://github.com/o/r/pull/42');
    const creates = wm.ghCalls.filter((c) => c[0] === 'pr' && c[1] === 'create');
    expect(creates).toHaveLength(3);
  });

  it('surfaces a ship error when gh pr create keeps failing past the retry budget', async () => {
    const wm = new ShipStubWM(config());
    wm.ghCreateFailuresBeforeSuccess = 5; // exceeds the 3-attempt budget
    const result = await wm.shipWorkspace('ISS-1', { title: 't', body: 'b' });
    expect(result.ok).toBe(false);
  });

  it('commits + branches + pushes + creates a PR, returning the branch + prUrl', async () => {
    const wm = new ShipStubWM(config());
    const result = await wm.shipWorkspace('ISS-1', { title: 'my title', body: 'my body' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.branch).toBe('orchestrator/iss-1');
    expect(result.value.prUrl).toBe('https://github.com/o/r/pull/42');

    // Sequence: add -A → commit → switch -c (slash-prefixed) → push -u → gh pr create.
    const add = wm.gitCalls.find((c) => c[0] === 'add');
    expect(add).toEqual(['add', '-A']);
    const commit = wm.gitCalls.find((c) => c[0] === 'commit');
    // Commit runs THROUGH the real pre-commit gate (no --no-verify) — the worktree
    // builds the CLI so `harness ci check` runs; a block feeds back for remediation.
    expect(commit?.slice(0, 2)).toEqual(['commit', '-m']);
    // SLASH-prefixed branch so findPushedBranch recognizes it.
    const branchCall = wm.gitCalls.find((c) => c[0] === 'switch' || c[0] === 'checkout');
    expect(branchCall).toContain('orchestrator/iss-1');
    const push = wm.gitCalls.find((c) => c[0] === 'push');
    expect(push).toEqual(['push', '-u', 'origin', 'orchestrator/iss-1']);

    // gh pr create with the head branch, a base, the title + body (array args, no shell).
    const pr = wm.ghCalls.find((c) => c[0] === 'pr' && c[1] === 'create');
    expect(pr).toBeDefined();
    expect(pr).toContain('--head');
    expect(pr).toContain('orchestrator/iss-1');
    expect(pr).toContain('--title');
    expect(pr).toContain('my title');
    expect(pr).toContain('--body');
    expect(pr).toContain('my body');
    expect(pr).toContain('--base');
    expect(pr).toContain('main');
  });

  it('no-op commit (clean tree) does NOT error the flow — still branches + pushes + PRs', async () => {
    const wm = new ShipStubWM(config());
    wm.statusOutput = ''; // clean working tree ⇒ nothing to commit
    const result = await wm.shipWorkspace('ISS-1', { title: 't', body: 'b' });

    expect(result.ok).toBe(true);
    // A clean tree must not attempt a commit that would exit non-zero.
    expect(wm.gitCalls.find((c) => c[0] === 'commit')).toBeUndefined();
    // But it still branches + pushes + opens a PR (the accumulated work is committed already).
    expect(wm.gitCalls.find((c) => c[0] === 'push')).toBeDefined();
    expect(wm.ghCalls.find((c) => c[0] === 'pr' && c[1] === 'create')).toBeDefined();
  });

  it('guarded: a failing commit returns Err (never throws out)', async () => {
    const wm = new ShipStubWM(config());
    wm.failGit = (a) => a[0] === 'commit';
    const result = await wm.shipWorkspace('ISS-1', { title: 't', body: 'b' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(Error);
  });

  it('guarded: a failing push returns Err (never throws out), no PR attempted', async () => {
    const wm = new ShipStubWM(config());
    wm.failGit = (a) => a[0] === 'push';
    const result = await wm.shipWorkspace('ISS-1', { title: 't', body: 'b' });
    expect(result.ok).toBe(false);
    // Ship halts at the failed push — no PR is created against an unpushed branch.
    expect(wm.ghCalls.find((c) => c[0] === 'pr' && c[1] === 'create')).toBeUndefined();
  });

  it('guarded: a failing gh pr create returns Err (never throws out)', async () => {
    const wm = new ShipStubWM(config());
    wm.failGh = (a) => a[0] === 'pr' && a[1] === 'create';
    const result = await wm.shipWorkspace('ISS-1', { title: 't', body: 'b' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBeInstanceOf(Error);
  });
});

/**
 * staged-verify-gate-convergence (IMPORTANT #1) — `shipWorkspace` must be
 * RESUMABLE/idempotent. A partial prior ship (push succeeded, `gh pr create`
 * failed) leaves a pushed remote branch (and a local `orchestrator/<id>` branch
 * in the PR-preserved worktree). On the retry, a blind `git switch -c` errors on
 * the pre-existing branch and a blind push/`gh pr create` would strand OR
 * duplicate. Ship must: switch to an existing local branch (no `-c`); skip push
 * when already on the remote; and treat "branch pushed + open PR exists" as
 * ALREADY DONE (no duplicate PR). Calling ship twice converges to exactly one PR
 * and never errors on a pre-existing branch.
 */
describe('WorkspaceManager.shipWorkspace — idempotent/resumable (IMPORTANT #1)', () => {
  it('(a) branch already exists LOCALLY → switches to it (no -c), pushes/creates PR, Ok', async () => {
    const wm = new ShipStubWM(config());
    wm.localBranchExists = true; // e.g. a prior partial ship created the branch

    const result = await wm.shipWorkspace('ISS-1', { title: 't', body: 'b' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.branch).toBe('orchestrator/iss-1');
    // Switched to the existing branch WITHOUT -c (a `switch -c` would error).
    const switchCall = wm.gitCalls.find((c) => c[0] === 'switch' || c[0] === 'checkout');
    expect(switchCall).toBeDefined();
    expect(switchCall).not.toContain('-c');
    expect(switchCall).toContain('orchestrator/iss-1');
    // Remote not yet pushed (default) + no PR yet ⇒ resume push + create PR.
    expect(wm.gitCalls.find((c) => c[0] === 'push')).toBeDefined();
    expect(wm.ghCalls.find((c) => c[0] === 'pr' && c[1] === 'create')).toBeDefined();
  });

  it('(b) branch pushed + open PR already exists → Ok, gh pr create NOT called again (no duplicate)', async () => {
    const wm = new ShipStubWM(config());
    wm.remoteBranchExists = true;
    wm.openPrExists = true;

    const result = await wm.shipWorkspace('ISS-1', { title: 't', body: 'b' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.branch).toBe('orchestrator/iss-1');
    // Ship is ALREADY DONE → no duplicate PR is created.
    expect(wm.ghCalls.find((c) => c[0] === 'pr' && c[1] === 'create')).toBeUndefined();
    // The already-open PR URL is surfaced (from the pr-list probe).
    expect(result.value.prUrl).toContain('/pull/42');
  });

  it('(c) branch pushed, NO PR → resumes straight at gh pr create (push skipped)', async () => {
    const wm = new ShipStubWM(config());
    wm.remoteBranchExists = true;
    wm.openPrExists = false;

    const result = await wm.shipWorkspace('ISS-1', { title: 't', body: 'b' });

    expect(result.ok).toBe(true);
    // Already on the remote → no redundant push.
    expect(wm.gitCalls.find((c) => c[0] === 'push')).toBeUndefined();
    // Resume at the PR create step.
    expect(wm.ghCalls.find((c) => c[0] === 'pr' && c[1] === 'create')).toBeDefined();
  });

  it('S1: an explicit workspacePath is used verbatim (the gate-verified worktree), NOT re-derived from the identifier', async () => {
    class PathCaptureWM extends ShipStubWM {
      public statusCwd?: string;
      protected async git(args: string[], cwd: string): Promise<string> {
        // Capture the cwd of the porcelain probe — proves which worktree ship runs in.
        if (args[0] === 'status') this.statusCwd = cwd;
        return super.git(args, cwd);
      }
    }
    const wm = new PathCaptureWM(config());
    // A path OUTSIDE the derived workspace root — cross-platform via path.resolve.
    const gated = path.resolve(path.join('explicit', 'gated', 'worktree'));
    const result = await wm.shipWorkspace('ISS-1', { title: 't', body: 'b', workspacePath: gated });
    expect(result.ok).toBe(true);
    // Ship committed the threaded worktree, not resolvePath(<root>/iss-1).
    expect(wm.statusCwd).toBe(gated);
    expect(wm.statusCwd).not.toBe(path.resolve(wm.resolvePath('ISS-1')));
  });

  it('idempotent: calling ship TWICE converges to exactly one PR, never errors on the pre-existing branch', async () => {
    const wm = new ShipStubWM(config());

    // First ship: fresh create → push → PR.
    const first = await wm.shipWorkspace('ISS-1', { title: 't', body: 'b' });
    expect(first.ok).toBe(true);

    // Model the resulting world for the second call: branch now exists locally +
    // on the remote, and the first call opened the PR.
    wm.localBranchExists = true;
    wm.remoteBranchExists = true;
    wm.openPrExists = true;
    const before = wm.ghCalls.filter((c) => c[0] === 'pr' && c[1] === 'create').length;

    const second = await wm.shipWorkspace('ISS-1', { title: 't', body: 'b' });
    expect(second.ok).toBe(true); // never errors on the pre-existing branch
    const after = wm.ghCalls.filter((c) => c[0] === 'pr' && c[1] === 'create').length;
    // Exactly one PR total — the second call did NOT create a duplicate.
    expect(after).toBe(before);
    expect(before).toBe(1);
  });
});
