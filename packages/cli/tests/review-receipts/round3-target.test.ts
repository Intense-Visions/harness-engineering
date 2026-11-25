import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCheckReviewReceipt } from '../../src/review-receipts/gate';
import { runReviewTier } from '../../src/commands/review-tier';

/**
 * Review round 3, fix 1, against real git: a final review's --target / diff.target may not be the
 * branch under review itself (its upstream, or a remote-tracking branch of the same name). Its
 * merge base with the head is the branch's own last pushed commit, so the review would cover
 * only the commits since the last push.
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
const codes = () =>
  runCheckReviewReceipt({ receiptPath: finalDir(), cwd: tmp }).failures.map((f) => f.code);

let parentTip: string;
let pushed: string;
let head: string;
beforeEach(() => {
  root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-r3-target-')));
  tmp = path.join(root, 'work');
  fs.mkdirSync(tmp);
  git(root, 'init', '-q', '--bare', 'remote.git');
  g('init', '-q', '-b', 'main');
  fs.writeFileSync(path.join(tmp, '.gitignore'), '.harness/\n');
  g('add', '.gitignore');
  g('commit', '-q', '--no-verify', '-m', 'root');
  g('remote', 'add', 'origin', path.join(root, 'remote.git'));
  g('push', '-q', 'origin', 'main');
  g('checkout', '-q', '-b', 'parent');
  parentTip = commit('p.txt');
  g('push', '-q', 'origin', 'parent');
  g('checkout', '-q', '-b', 'feat');
  commit('f1.txt');
  pushed = commit('f2.txt');
  g('push', '-q', '-u', 'origin', 'feat');
  head = commit('f3.txt');
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('fix 1: the gate refuses the branch under review as diff.target', () => {
  it("the branch's own upstream fails TARGET_OWN_BRANCH (the reviewer repro)", () => {
    writeFinal(pushed, head, 'refs/remotes/origin/feat', ['f3.txt']);
    expect(codes()).toEqual(['TARGET_OWN_BRANCH']);
  });
  it('a remote-tracking branch of the same name on another remote fails too', () => {
    g('update-ref', 'refs/remotes/mirror/feat', pushed);
    writeFinal(pushed, head, 'refs/remotes/mirror/feat', ['f3.txt']);
    expect(codes()).toEqual(['TARGET_OWN_BRANCH']);
  });
  it('the same-name rule holds with no upstream configured', () => {
    g('branch', '--unset-upstream');
    writeFinal(pushed, head, 'refs/remotes/origin/feat', ['f3.txt']);
    expect(codes()).toEqual(['TARGET_OWN_BRANCH']);
  });
  it('positive control: the parent branch is accepted', () => {
    writeFinal(parentTip, head, 'refs/remotes/origin/parent', ['f1.txt', 'f2.txt', 'f3.txt']);
    expect(codes()).toEqual([]);
  });
});

describe('fix 1: review-tier refuses the same targets', () => {
  it.each(['origin/feat', 'refs/remotes/origin/feat'])('--target %s is unresolved', (target) => {
    const out = runReviewTier({ moment: 'final', target, cwd: tmp });
    expect(out.ok && 'baseUnresolved' in out.value && out.value.baseUnresolved).toBe(
      'target-own-branch'
    );
  });
  it('standalone refuses it as well', () => {
    const out = runReviewTier({ moment: 'standalone', target: 'origin/feat', cwd: tmp });
    expect(out.ok && 'baseUnresolved' in out.value && out.value.baseUnresolved).toBe(
      'target-own-branch'
    );
  });
  it('positive control: --target origin/parent resolves to the parent tip', () => {
    const out = runReviewTier({ moment: 'final', target: 'origin/parent', cwd: tmp });
    expect(out.ok && 'base' in out.value && out.value.base).toBe(parentTip);
  });
});
