import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Command } from 'commander';
import { createCheckReviewReceiptCommand } from '../../src/commands/check-review-receipt';

/** Fix rounds: `check-review-receipt --archive-round` through the command, in a real repository. */
let tmp: string;
let dir: string;
let out: string[];
let first: string;
let second: string;
const g = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: tmp, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
const commit = (name: string) => {
  fs.writeFileSync(path.join(tmp, name), `${name}\n`);
  g('add', name);
  g('commit', '-q', '--no-verify', '-m', name);
  return g('rev-parse', 'HEAD');
};
const receiptAt = (head: string) =>
  JSON.stringify({
    schemaVersion: 1,
    moment: 'phase',
    tier: 'light',
    backend: 'agent',
    diff: { base: first, head },
    coldContext: true,
    priorFindingsSupplied: false,
    reviewers: [
      { id: 'compliance-bug', required: true, ran: true, findingsPath: 'compliance-bug.json' },
    ],
    blocking: 1,
    advisory: 0,
  });
/** The reviewer's findings file for a round at `head`, holding `blocking` blocking findings. */
const findingsAt = (head: string, blocking = 1) =>
  JSON.stringify({
    schemaVersion: 1,
    reviewerId: 'compliance-bug',
    base: first,
    head,
    examinedFiles: ['b.txt'],
    findings: Array.from({ length: blocking }, (_, i) => ({
      id: `f${i}`,
      file: 'b.txt',
      lineRange: [1, 1],
      severity: 'important',
      title: `f${i}`,
      findingClass: 'edge-case',
      escapedFrom: 'plan',
    })),
  });
/** A round's receipt and findings file at `head`, written into `at` (the review directory). */
const writeRound = (head: string, at = dir, extra: Record<string, unknown> = {}) => {
  fs.writeFileSync(
    path.join(at, 'receipt.json'),
    JSON.stringify({ ...JSON.parse(receiptAt(head)), ...extra })
  );
  fs.writeFileSync(path.join(at, 'compliance-bug.json'), findingsAt(head));
};
const codes = () => ((json().failures ?? []) as Array<{ code: string }>).map((f) => f.code);
beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-r4-archive-')));
  g('init', '-q');
  first = commit('a.txt');
  second = commit('b.txt');
  dir = path.join(tmp, '.harness', 'sessions', 's1', 'reviews', 'phase-0');
  fs.mkdirSync(dir, { recursive: true });
  out = [];
  vi.spyOn(console, 'log').mockImplementation((s: string) => void out.push(s));
});
afterEach(() => {
  vi.restoreAllMocks();
  process.exitCode = undefined;
  fs.rmSync(tmp, { recursive: true, force: true });
});
const run = async (...args: string[]) => {
  const program = new Command().option('--json');
  program.addCommand(createCheckReviewReceiptCommand({ cwd: () => tmp }));
  await program.parseAsync(['node', 'harness', ...args]);
};
const json = () => JSON.parse(out.join(''));

describe('check-review-receipt --archive-round', () => {
  it('archives round 1 after a fix commit and says the next review is round 2; then round 2', async () => {
    fs.writeFileSync(path.join(dir, 'receipt.json'), receiptAt(first));
    await run('--json', 'check-review-receipt', '--archive-round', dir);
    expect(json()).toEqual({ ok: true, archived: 1, next: 2 });
    expect(process.exitCode).toBe(0);
    out = [];
    fs.writeFileSync(path.join(dir, 'receipt.json'), receiptAt(second));
    commit('c.txt');
    await run('--json', 'check-review-receipt', '--archive-round', dir);
    expect(json()).toEqual({ ok: true, archived: 2, next: 3 });
  });
  it('a relative review directory is read from the working directory', async () => {
    fs.writeFileSync(path.join(dir, 'receipt.json'), receiptAt(first));
    await run(
      '--json',
      'check-review-receipt',
      '--archive-round',
      '.harness/sessions/s1/reviews/phase-0'
    );
    expect(json()).toEqual({ ok: true, archived: 1, next: 2 });
  });
  it('no receipt.json: nothing to archive, exit 1', async () => {
    fs.writeFileSync(path.join(dir, 'bug.json'), '{}');
    await run('--json', 'check-review-receipt', '--archive-round', dir);
    expect(json().ok).toBe(false);
    expect(json().error).toMatch(/no receipt\.json/);
    expect(process.exitCode).toBe(1);
    expect(fs.readdirSync(dir)).toEqual(['bug.json']);
  });
  it('HEAD is the head the round reviewed: a fix round needs a fix commit, exit 1', async () => {
    fs.writeFileSync(path.join(dir, 'receipt.json'), receiptAt(second));
    await run('--json', 'check-review-receipt', '--archive-round', dir);
    expect(json().error).toMatch(/fix commit/);
    expect(process.exitCode).toBe(1);
    expect(fs.readdirSync(dir)).toEqual(['receipt.json']);
  });
  it.each([
    ['an empty path', ''],
    ['the repository top', '.'],
  ])('%s is not a review directory: exit 1, no repository file moves', async (_name, arg) => {
    fs.writeFileSync(path.join(tmp, 'receipt.json'), receiptAt(first));
    const before = fs.readdirSync(tmp).sort();
    await run('--json', 'check-review-receipt', '--archive-round', arg);
    expect(json().error).toMatch(/is not a review directory/);
    expect(process.exitCode).toBe(1);
    expect(fs.readdirSync(tmp).sort()).toEqual(before);
  });
  it('the text output names the archive and the next round', async () => {
    fs.writeFileSync(path.join(dir, 'receipt.json'), receiptAt(first));
    const info = vi.spyOn(console, 'log');
    await run('check-review-receipt', '--archive-round', dir);
    expect(info.mock.calls.flat().join('\n')).toMatch(
      /archived round 1 into round-1\/; the next review is round 2/
    );
  });
  it('a path and --archive-round together exit 1 and archive nothing', async () => {
    fs.writeFileSync(path.join(dir, 'receipt.json'), receiptAt(first));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await run('check-review-receipt', dir, '--archive-round', dir);
    expect(process.exitCode).toBe(1);
    expect(fs.existsSync(path.join(dir, 'receipt.json'))).toBe(true);
  });
});

describe('check-review-receipt gates a fix round against its archives', () => {
  it('a round 2 receipt that lists round 1 passes the round checks; a missing priorRounds fails', async () => {
    writeRound(first);
    await run('--json', 'check-review-receipt', '--archive-round', dir);
    out = [];
    const round2 = JSON.parse(receiptAt(second));
    writeRound(second, dir, { round: 2 });
    await run('--json', 'check-review-receipt', dir);
    const codes = (json().failures as Array<{ code: string }>).map((f) => f.code);
    expect(codes).toContain('PRIOR_ROUNDS_MISMATCH');
    expect(codes).not.toContain('ROUND_MISMATCH');
    out = [];
    const priorRounds = [{ round: 1, head: first, blocking: 1 }];
    fs.writeFileSync(
      path.join(dir, 'receipt.json'),
      JSON.stringify({ ...round2, round: 2, priorRounds })
    );
    await run('--json', 'check-review-receipt', dir);
    const after = ((json().failures ?? []) as Array<{ code: string }>).map((f) => f.code);
    expect(after.filter((c) => c.startsWith('ROUND') || c.startsWith('PRIOR'))).toEqual([]);
  });
});

describe('check-review-receipt --archive-round reads no other flag', () => {
  it.each([
    ['--moment', 'phase'],
    ['--base', 'HEAD'],
    ['--head', 'HEAD'],
  ])('%s with --archive-round exits 1 and archives nothing', async (flag, value) => {
    fs.writeFileSync(path.join(dir, 'receipt.json'), receiptAt(first));
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await run('check-review-receipt', '--archive-round', dir, flag, value);
    expect(process.exitCode).toBe(1);
    expect(err.mock.calls.flat().join(' ')).toMatch(/do not apply to --archive-round/);
    expect(fs.readdirSync(dir)).toEqual(['receipt.json']);
  });
});

describe('an interrupted archive through the command', () => {
  const staging = () => path.join(dir, '.round-1.partial');
  it('killed before the last rename: the gate fails with ROUND_ARCHIVE_INTERRUPTED; --archive-round completes it', async () => {
    fs.mkdirSync(staging());
    writeRound(first, staging());
    await run('--json', 'check-review-receipt', dir);
    expect(codes()).toEqual(['RECEIPT_MISSING', 'ROUND_ARCHIVE_INTERRUPTED']);
    out = [];
    const info = vi.spyOn(console, 'log');
    await run('check-review-receipt', '--archive-round', dir);
    expect(process.exitCode).toBe(0);
    expect(info.mock.calls.flat().join('\n')).toMatch(
      /completed an interrupted archive of round 1: archived round 1 into round-1\/; the next review is round 2/
    );
    expect(fs.readdirSync(dir)).toEqual(['round-1']);
  });
  it('killed mid-move: the gate fails beside the receipt; --archive-round undoes it, then archives', async () => {
    writeRound(first);
    fs.mkdirSync(staging());
    fs.renameSync(
      path.join(dir, 'compliance-bug.json'),
      path.join(staging(), 'compliance-bug.json')
    );
    await run('--json', 'check-review-receipt', dir);
    expect(codes()).toContain('ROUND_ARCHIVE_INTERRUPTED');
    out = [];
    await run('--json', 'check-review-receipt', '--archive-round', dir);
    expect(json()).toEqual({ ok: true, archived: 1, next: 2, interrupted: 'undone' });
    expect(fs.readdirSync(path.join(dir, 'round-1')).sort()).toEqual([
      'compliance-bug.json',
      'receipt.json',
    ]);
    out = [];
    writeRound(second, dir, { round: 2, priorRounds: [{ round: 1, head: first, blocking: 1 }] });
    await run('--json', 'check-review-receipt', dir);
    expect(codes().filter((c) => c.startsWith('ROUND') || c.startsWith('PRIOR'))).toEqual([]);
  });
  it('a prior round whose archived findings hold another blocking count than its receipt fails', async () => {
    writeRound(first);
    fs.writeFileSync(path.join(dir, 'compliance-bug.json'), findingsAt(first, 3));
    await run('--json', 'check-review-receipt', '--archive-round', dir);
    out = [];
    // The archived receipt says 1 blocking; its findings file holds 3, so 3 is the count.
    writeRound(second, dir, { round: 2, priorRounds: [{ round: 1, head: first, blocking: 1 }] });
    await run('--json', 'check-review-receipt', dir);
    expect(codes()).toContain('PRIOR_ROUNDS_MISMATCH');
    out = [];
    writeRound(second, dir, { round: 2, priorRounds: [{ round: 1, head: first, blocking: 3 }] });
    await run('--json', 'check-review-receipt', dir);
    expect(codes()).not.toContain('PRIOR_ROUNDS_MISMATCH');
  });
});
