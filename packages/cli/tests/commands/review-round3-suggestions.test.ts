import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import { createReviewTierCommand, runReviewTier } from '../../src/commands/review-tier';
import { resolveFinalReviewBase } from '../../src/review-receipts/io';

/** Unit 1 review round 3, the suggestions taken: against real git. */
let tmp: string;
const g = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: tmp, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
let c: string[];
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-r3-suggest-')));
  g('init', '-q', '-b', 'work');
  c = [];
  for (const n of [0, 1, 2, 3]) {
    fs.writeFileSync(path.join(tmp, `f${n}.txt`), `${n}\n`);
    g('add', '--', `f${n}.txt`);
    g('commit', '-q', '--no-verify', '-m', `c${n}`);
    c.push(g('rev-parse', 'HEAD'));
  }
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('the default branch is looked up by its full remote-tracking ref', () => {
  it('a local branch named origin/main does not shadow refs/remotes/origin/main', () => {
    g('update-ref', 'refs/remotes/origin/main', c[0]!);
    g('branch', 'origin/main', c[2]!);
    expect(resolveFinalReviewBase({ cwd: tmp, head: c[3]! })).toEqual({
      status: 'resolved',
      base: c[0],
      baseSource: 'merge-base',
    });
  });
  it('origin/HEAD is followed to its full ref', () => {
    g('update-ref', 'refs/remotes/origin/trunk', c[1]!);
    g('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/trunk');
    g('branch', 'origin/trunk', c[2]!);
    expect(resolveFinalReviewBase({ cwd: tmp, head: c[3]! })).toMatchObject({ base: c[1] });
  });
});

describe('review-tier: a flag the moment does not read is an error', () => {
  it.each([
    ['final', { complexity: 'high' as const }, /--complexity/],
    ['standalone', { complexity: 'low' as const }, /--complexity/],
    ['final', { rigor: 'thorough' as const }, /--rigor/],
    ['standalone', { rigor: 'fast' as const }, /--rigor/],
  ])('--moment %s with %j', (moment, flags, message) => {
    const out = runReviewTier({ moment: moment as 'final' | 'standalone', cwd: tmp, ...flags });
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error.message).toMatch(message);
  });
  it('positive control: a phase reads them', () => {
    const out = runReviewTier({
      moment: 'phase',
      base: c[0]!,
      head: c[3]!,
      complexity: 'high',
      rigor: 'fast',
      cwd: tmp,
    });
    expect(out.ok && out.value.reasons).toEqual(['complexity:high']);
  });
});

describe('review-tier prints the caller text and git errors inert', () => {
  it('an unresolvable --base holding an escape sequence is printed escaped', async () => {
    const program = new Command().option('--json');
    program.addCommand(createReviewTierCommand({ cwd: () => tmp }));
    const err: string[] = [];
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation((...a) => void err.push(a.join(' ')));
    const bad = 'x\u001b[2K\rReview tier: light';
    await program.parseAsync(['node', 'harness', 'review-tier', '--base', bad, '--head', 'HEAD']);
    expect(process.exitCode).toBe(1);
    const text = err.join('\n');
    expect(text).not.toContain('\u001b');
    expect(text).toContain('\\u{001B}[2K\\u{000D}Review tier: light');
  });
});
