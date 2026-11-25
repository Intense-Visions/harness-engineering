import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { formatReviewTier, runReviewTier } from '../../src/commands/review-tier';

/**
 * Review round 4, fix 5 and a suggestion, against real git: `review-tier --moment final` reports
 * an empty final range (exit 1, as a phase with no files does) instead of handing out a base no
 * receipt can pass over, and its text output prints the head it computed the base at.
 */
let tmp: string;
const g = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: tmp, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
const commit = (name: string) => {
  fs.writeFileSync(path.join(tmp, name), `${name}\n`);
  g('add', '--', name);
  g('commit', '-q', '--no-verify', '-m', name);
  return g('rev-parse', 'HEAD');
};

let c0: string;
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-r4-empty-final-')));
  g('init', '-q', '-b', 'work');
  c0 = commit('a.txt');
  g('update-ref', 'refs/remotes/origin/main', c0);
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('round 4 fix 5: an empty final range is reported, not reviewed', () => {
  it('base equals head: exit 1 with an empty-range message', () => {
    const out = runReviewTier({ moment: 'final', cwd: tmp });
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error.message).toMatch(
      new RegExp(`^the final range ${c0}\\.\\.${c0} is empty \\(it changes no files\\)`)
    );
  });
  it('commits that net to no change: exit 1 as well', () => {
    commit('b.txt');
    g('rm', '-q', '--', 'b.txt');
    g('commit', '-q', '--no-verify', '-m', 'revert b');
    const out = runReviewTier({ moment: 'final', cwd: tmp });
    expect(!out.ok && out.error.message).toMatch(/is empty \(it changes no files\)/);
  });
  it('positive control: a non-empty final range resolves, and the text output names the head', () => {
    const head = commit('b.txt');
    const out = runReviewTier({ moment: 'final', cwd: tmp });
    expect(out.ok && 'base' in out.value && out.value.base).toBe(c0);
    expect(out.ok && formatReviewTier(out.value)).toContain(`Review head: ${head}`);
  });
  it('a standalone review over HEAD prints its head too', () => {
    const head = commit('b.txt');
    const out = runReviewTier({ moment: 'standalone', cwd: tmp });
    expect(out.ok && formatReviewTier(out.value)).toContain(`Review head: ${head}`);
  });
});
