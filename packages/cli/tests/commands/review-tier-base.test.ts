import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  formatReviewTier,
  runReviewTier,
  type ReviewTierOptions,
} from '../../src/commands/review-tier';
import { runCheckReviewReceipt } from '../../src/review-receipts/gate';

/**
 * Fixes 7 and 8, against real git. History: c0 is origin/main; c1 and c2 are a parent unit's
 * branch (origin/parent at c2); c3 and c4 are this branch. A standalone review takes its base
 * from the range it reviews, and the final review of a stacked branch is based at its target's
 * merge base when `--target` names it.
 */
let tmp: string;
const g = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: tmp, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
let c: string[];
const FULL = ['compliance', 'bug', 'security', 'architecture'];
const sessionDir = () => path.join(tmp, '.harness', 'sessions', 's1');
const run = (opts: Omit<ReviewTierOptions, 'cwd'>) => runReviewTier({ cwd: tmp, ...opts });
const text = (opts: Omit<ReviewTierOptions, 'cwd'>) => {
  const out = run(opts);
  return out.ok
    ? formatReviewTier(out.value, opts.target).join('\n')
    : `ERROR ${out.error.message}`;
};

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-tier-base-')));
  g('init', '-q', '-b', 'work');
  fs.writeFileSync(path.join(tmp, '.gitignore'), '.harness/\n');
  c = [];
  for (const n of [0, 1, 2, 3, 4]) {
    fs.writeFileSync(path.join(tmp, `f${n}.txt`), `${n}\n`);
    g('add', '--', `f${n}.txt`, '.gitignore');
    g('commit', '-q', '--no-verify', '-m', `c${n}`);
    c.push(g('rev-parse', 'HEAD'));
  }
  fs.mkdirSync(sessionDir(), { recursive: true });
  fs.writeFileSync(
    path.join(sessionDir(), 'autopilot-state.json'),
    JSON.stringify({ startingCommit: c[2] })
  );
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
const withMain = () => g('update-ref', 'refs/remotes/origin/main', c[0]!);
const withParent = () => g('update-ref', 'refs/remotes/origin/parent', c[2]!);

describe('fix 7: a standalone review has its own base rule and never advises --session', () => {
  it('a default branch resolves: its merge base', () => {
    withMain();
    const out = run({ moment: 'standalone' });
    expect(out.ok && out.value).toMatchObject({ base: c[0], baseSource: 'merge-base' });
  });
  it('no default branch: unresolved for its own reason, telling the caller to name the range', () => {
    const out = run({ moment: 'standalone' });
    expect(out.ok && out.value).toMatchObject({ baseUnresolved: 'no-default-branch' });
    const t = text({ moment: 'standalone' });
    expect(t).toMatch(/Review base: unresolved \(no default-branch merge base: name the range/);
    expect(t).toMatch(/commit-range/);
    expect(t).not.toMatch(/--session/);
  });
  it('a final review with no default branch and no session still points at --session', () => {
    expect(text({ moment: 'final' })).toMatch(/--session/);
  });
  it.each<[string, Omit<ReviewTierOptions, 'cwd'>, RegExp]>([
    [
      'standalone with --session',
      { moment: 'standalone', session: 's1' },
      /--session applies to --moment final only/,
    ],
    [
      'phase with --session',
      { moment: 'phase', base: 'HEAD~1', head: 'HEAD', session: 's1' },
      /--session applies to --moment final only/,
    ],
    [
      'final with --base',
      { moment: 'final', base: 'HEAD~1' },
      /--base applies to --moment phase only/,
    ],
    [
      'standalone with --base',
      { moment: 'standalone', base: 'HEAD~1' },
      /--base applies to --moment phase only/,
    ],
    [
      'phase with --target',
      { moment: 'phase', base: 'HEAD~1', head: 'HEAD', target: 'origin/parent' },
      /--target applies to --moment final and standalone only/,
    ],
  ])('%s is an error', (_n, opts, message) => {
    const out = run(opts);
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error.message).toMatch(message);
  });
});

describe('fix 8: --target names the branch a stacked branch merges into', () => {
  it.each<[string, () => void, Omit<ReviewTierOptions, 'cwd'>, Record<string, unknown>]>([
    [
      'final, no target: origin/main',
      () => (withMain(), withParent()),
      { moment: 'final', session: 's1' },
      { base: 'c0', baseSource: 'merge-base' },
    ],
    [
      'final, --target origin/parent',
      () => (withMain(), withParent()),
      { moment: 'final', session: 's1', target: 'origin/parent' },
      { base: 'c2', baseSource: 'merge-base' },
    ],
    [
      'final, --target with no origin/main',
      withParent,
      { moment: 'final', target: 'origin/parent' },
      { base: 'c2', baseSource: 'merge-base' },
    ],
    [
      'standalone, --target origin/parent',
      () => (withMain(), withParent()),
      { moment: 'standalone', target: 'origin/parent' },
      { base: 'c2', baseSource: 'merge-base' },
    ],
    [
      'final, --target unresolvable',
      withMain,
      { moment: 'final', target: 'origin/nope' },
      { baseUnresolved: 'target-unresolved' },
    ],
    [
      'final, --target that looks like an option',
      withMain,
      { moment: 'final', target: '--output=x' },
      { baseUnresolved: 'target-unresolved' },
    ],
  ])('%s', (_n, setup, opts, expected) => {
    setup();
    const out = run(opts);
    const want = Object.fromEntries(
      Object.entries(expected).map(([k, v]) => [
        k,
        typeof v === 'string' && /^c\d$/.test(v) ? c[Number(v[1])] : v,
      ])
    );
    expect(out.ok && out.value).toMatchObject(want);
  });
  it('the unresolved text names the target', () => {
    expect(text({ moment: 'final', target: 'origin/nope' })).toMatch(/--target "origin\/nope"/);
  });
});

describe('fix 8: the gate takes the same --target for a final receipt', () => {
  function writeFinal(base: string) {
    const dir = path.join(sessionDir(), 'reviews', 'final-all');
    fs.mkdirSync(dir, { recursive: true });
    const head = c[4]!;
    const receipt = {
      schemaVersion: 1,
      moment: 'final',
      tier: 'full',
      backend: 'agent',
      diff: { base, head },
      coldContext: true,
      priorFindingsSupplied: false,
      reviewers: FULL.map((id) => ({ id, required: true, ran: true, findingsPath: `${id}.json` })),
      blocking: 0,
      advisory: 0,
    };
    fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt));
    for (const id of FULL) {
      const file = {
        schemaVersion: 1,
        reviewerId: id,
        head,
        examinedFiles: ['f4.txt'],
        findings: [],
      };
      fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(file));
    }
    return dir;
  }
  const codes = (dir: string, target?: string) =>
    runCheckReviewReceipt({ receiptPath: dir, cwd: tmp, ...(target && { target }) }).failures.map(
      (f) => f.code
    );
  it.each<[string, string, string | undefined, string[]]>([
    ['based at the target merge base, with --target', 'c2', 'origin/parent', []],
    [
      'based at the target merge base, without --target',
      'c2',
      undefined,
      ['FINAL_BASE_NOT_MERGE_BASE'],
    ],
    ['based at origin/main, with --target', 'c0', 'origin/parent', ['FINAL_BASE_NOT_MERGE_BASE']],
    ['based at origin/main, without --target', 'c0', undefined, []],
    ['--target unresolvable', 'c2', 'origin/nope', ['TARGET_UNRESOLVED']],
  ])('%s', (_n, base, target, expected) => {
    withMain();
    withParent();
    expect(codes(writeFinal(c[Number(base[1])]!), target)).toEqual(expected);
  });
});

describe('fix 14: an invalid review config key is reported under its own name', () => {
  it.each<[string, unknown, RegExp]>([
    ['backend', { review: { backend: 'cloud' } }, /review\.backend/],
    ['model_tiers', { review: { model_tiers: 'bogus' } }, /review\.model_tiers/],
  ])('%s', (key, config, message) => {
    fs.writeFileSync(path.join(tmp, 'harness.config.json'), JSON.stringify(config));
    const out = run({ moment: 'standalone' });
    expect(out.ok).toBe(false);
    expect(!out.ok && out.error.message).toMatch(message);
    if (key !== 'backend') expect(!out.ok && out.error.message).not.toMatch(/review\.backend/);
  });
});
