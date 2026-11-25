import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCheckReviewReceipt } from '../../src/review-receipts/gate';
import { runReviewTier } from '../../src/commands/review-tier';
import { isOwnBranchRef, runGitIn } from '../../src/review-receipts/io';
import { formatCheckReviewReceipt } from '../../src/commands/check-review-receipt';

/**
 * Review round 4, fix 1, against real git: the branch under review is exactly
 * `refs/remotes/<r>/<current branch>` for a configured remote `r`. A stacked child's upstream is
 * its parent (git's default for `git checkout -b child origin/parent`), and a parent whose last
 * path segment is the child's name is another branch: both are valid targets.
 */
const FULL = ['compliance', 'bug', 'security', 'architecture'];
let root: string;
let tmp: string;
const git = (cwd: string, ...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
const g = (...args: string[]) => git(tmp, ...args);
const commit = (name: string) => {
  fs.writeFileSync(path.join(tmp, name), `${name}\n`);
  g('add', '--', name);
  g('commit', '-q', '--no-verify', '-m', name);
  return g('rev-parse', 'HEAD');
};
const finalDir = () => path.join(tmp, '.harness', 'sessions', 's1', 'reviews', 'final-all');

function writeFinal(base: string, head: string, target: string, files: string[]): void {
  const dir = finalDir();
  fs.mkdirSync(dir, { recursive: true });
  for (const id of FULL) {
    const file = {
      schemaVersion: 1,
      reviewerId: id,
      base,
      head,
      examinedFiles: files,
      findings: [],
    };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(file));
  }
  const receipt = {
    schemaVersion: 1,
    moment: 'final',
    tier: 'full',
    backend: 'agent',
    diff: { base, head, target },
    coldContext: true,
    priorFindingsSupplied: false,
    reviewers: FULL.map((id) => ({ id, required: true, ran: true, findingsPath: `${id}.json` })),
    blocking: 0,
    advisory: 0,
  };
  fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt));
}
const gate = () => runCheckReviewReceipt({ receiptPath: finalDir(), cwd: tmp });
const codes = () => gate().failures.map((f) => f.code);
const tierBase = (target: string) => {
  const out = runReviewTier({ moment: 'final', target, cwd: tmp });
  return out.ok && 'base' in out.value ? out.value.base : out;
};

beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-r4-target-')));
  tmp = path.join(root, 'work');
  fs.mkdirSync(tmp);
  git(root, 'init', '-q', '--bare', 'remote.git');
  g('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(tmp, '.gitignore'), '.harness/\n');
  g('add', '.gitignore');
  g('commit', '-q', '--no-verify', '-m', 'root');
  g('remote', 'add', 'origin', path.join(root, 'remote.git'));
  g('push', '-q', 'origin', 'main');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

/** Push a parent branch `name` with one commit and return its tip; HEAD stays on it. */
function pushParent(name: string): string {
  g('checkout', '-q', '-b', name, 'main');
  const tip = commit(`${name.replace(/\//g, '-')}.txt`);
  g('push', '-q', '-u', 'origin', name);
  return tip;
}

describe('round 4 fix 1: a stacked parent is a valid target', () => {
  it('a child created with `git checkout -b child origin/parent` (tracking it) resolves', () => {
    const parentTip = pushParent('parent');
    g('checkout', '-q', '-b', 'child', '--track', 'origin/parent');
    expect(g('rev-parse', '--abbrev-ref', '@{upstream}')).toBe('origin/parent');
    const head = commit('c.txt');
    expect(tierBase('origin/parent')).toBe(parentTip);
    writeFinal(parentTip, head, 'refs/remotes/origin/parent', ['c.txt']);
    expect(codes()).toEqual([]);
  });

  it('branch `gate` stacked on `origin/feat/gate` resolves', () => {
    const parentTip = pushParent('feat/gate');
    g('checkout', '-q', '-b', 'gate', 'feat/gate');
    const head = commit('g.txt');
    expect(tierBase('origin/feat/gate')).toBe(parentTip);
    writeFinal(parentTip, head, 'refs/remotes/origin/feat/gate', ['g.txt']);
    expect(codes()).toEqual([]);
  });

  it('branch `u2` stacked on `origin/stack/u2` resolves', () => {
    const parentTip = pushParent('stack/u2');
    g('checkout', '-q', '-b', 'u2', 'stack/u2');
    const head = commit('u.txt');
    expect(tierBase('origin/stack/u2')).toBe(parentTip);
    writeFinal(parentTip, head, 'refs/remotes/origin/stack/u2', ['u.txt']);
    expect(codes()).toEqual([]);
  });

  it('a final receipt whose target is refused names the target, not the starting commit', () => {
    pushParent('feat');
    const head = commit('f2.txt');
    g('push', '-q', 'origin', 'feat');
    writeFinal(head, head, 'refs/remotes/origin/feat', ['f2.txt']);
    const out = gate();
    expect(out.failures.map((f) => f.code)).toContain('TARGET_OWN_BRANCH');
    const header = formatCheckReviewReceipt(out)[0];
    expect(header).not.toMatch(/starting commit/);
    expect(header).toMatch(/final base: none \(target refs\/remotes\/origin\/feat is refused/);
  });
});

describe('round 4 fix 1: the branch under review is refused', () => {
  it('`origin/<same name>` is refused by review-tier and the gate', () => {
    const pushed = pushParent('feat');
    const head = commit('f2.txt');
    const out = runReviewTier({ moment: 'final', target: 'origin/feat', cwd: tmp });
    expect(out.ok && 'baseUnresolved' in out.value && out.value.baseUnresolved).toBe(
      'target-own-branch'
    );
    writeFinal(pushed, head, 'refs/remotes/origin/feat', ['f2.txt']);
    expect(codes()).toEqual(['TARGET_OWN_BRANCH']);
  });

  it('isOwnBranchRef: exact refs/remotes/<configured remote>/<branch> only', () => {
    pushParent('feat');
    expect(isOwnBranchRef(runGitIn, 'refs/remotes/origin/feat', tmp)).toBe(true);
    // Not a configured remote: a suffix match is not enough.
    g('update-ref', 'refs/remotes/stray/feat', 'HEAD');
    expect(isOwnBranchRef(runGitIn, 'refs/remotes/stray/feat', tmp)).toBe(false);
    expect(isOwnBranchRef(runGitIn, 'refs/remotes/origin/x/feat', tmp)).toBe(false);
  });
});
