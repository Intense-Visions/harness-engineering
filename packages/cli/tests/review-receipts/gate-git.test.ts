import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCheckFindingsFile, runCheckReviewReceipt } from '../../src/review-receipts/gate';

/**
 * The receipt gate and the reviewer self-check against real git, for defects that are about git
 * behaviour: a user's diff config, the working directory the commands run from.
 */
let tmp: string;
const g = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: tmp, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
const put = (rel: string, body: string) => {
  fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
  fs.writeFileSync(path.join(tmp, rel), body);
};
const commit = (rel: string, body: string) => {
  put(rel, body);
  g('add', '--', rel);
  g('commit', '-q', '--no-verify', '-m', `change ${rel}`);
  return g('rev-parse', 'HEAD');
};
let start: string;
let head: string;
const FULL = ['compliance', 'bug', 'security', 'architecture'];
const session = () => path.join(tmp, '.harness', 'sessions', 's1');

/** A full phase-0 review of start..head whose reviewers read `examined`. */
function writeReview(label: string, base: string, examined: string[], over = {}) {
  const dir = path.join(session(), 'reviews', label);
  fs.mkdirSync(dir, { recursive: true });
  for (const id of FULL) {
    const file = { schemaVersion: 1, reviewerId: id, head, examinedFiles: examined, findings: [] };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(file));
  }
  const receipt = {
    schemaVersion: 1,
    moment: label === 'final-all' ? 'final' : 'phase',
    tier: 'full',
    backend: 'agent',
    diff: { base, head },
    coldContext: true,
    priorFindingsSupplied: false,
    reviewers: FULL.map((id) => ({ id, required: true, ran: true, findingsPath: `${id}.json` })),
    blocking: 0,
    advisory: 0,
    ...over,
  };
  fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt));
  return dir;
}

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-gate-git-')));
  g('init', '-q');
  fs.writeFileSync(path.join(tmp, '.gitignore'), '.harness/\n');
  start = commit('root.ts', 'root\n');
  head = commit('pkg/sub/b.ts', 'b\n');
  fs.mkdirSync(session(), { recursive: true });
  fs.writeFileSync(
    path.join(session(), 'autopilot-state.json'),
    JSON.stringify({ startingCommit: start })
  );
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

/**
 * Fix 6. Partition: {run from the top, from a subdirectory} x {diff.relative unset, true}. The
 * diff is listed repository-relative in every row, as the reviewer was told to list it.
 */
describe('the diff file set is repository-relative from any directory', () => {
  const rows: Array<[string, string, boolean]> = [
    ['top, diff.relative unset', '', false],
    ['top, diff.relative=true', '', true],
    ['subdirectory, diff.relative unset', 'pkg/sub', false],
    ['subdirectory, diff.relative=true', 'pkg/sub', true],
  ];
  it.each(rows)('receipt gate from %s', (_n, sub, relative) => {
    if (relative) g('config', 'diff.relative', 'true');
    const dir = writeReview('phase-0', start, ['pkg/sub/b.ts']);
    const r = runCheckReviewReceipt({ receiptPath: dir, cwd: path.join(tmp, sub) });
    expect(r.failures).toEqual([]);
    expect(r.pass).toBe(true);
  });
  it.each(rows)('findings self-check from %s', (_n, sub, relative) => {
    if (relative) g('config', 'diff.relative', 'true');
    const dir = writeReview('phase-0', start, ['pkg/sub/b.ts']);
    const r = runCheckFindingsFile({
      findingsPath: path.join(dir, 'bug.json'),
      base: start,
      head,
      cwd: path.join(tmp, sub),
    });
    expect(r.failures).toEqual([]);
  });
});

/**
 * Fix 5. Partition of the working tree: clean; a tracked file modified; a change staged; a tracked
 * file deleted; only an untracked file; only an ignored file. Both modes; the self-check checks
 * the tree only when a range binds the file to a head.
 */
describe('the review is bound to a clean tracked tree', () => {
  const rows: Array<[string, () => void, boolean]> = [
    ['clean', () => {}, true],
    ['a tracked file modified', () => put('root.ts', 'edited\n'), false],
    [
      'a change staged',
      () => {
        put('root.ts', 'staged\n');
        g('add', '--', 'root.ts');
      },
      false,
    ],
    ['a tracked file deleted', () => fs.rmSync(path.join(tmp, 'root.ts')), false],
    ['only an untracked file', () => put('new.ts', 'n\n'), true],
    ['only an ignored file', () => put('.harness/x.json', '{}'), true],
  ];
  it.each(rows)('receipt gate: %s', (_n, change, clean) => {
    const dir = writeReview('phase-0', start, ['pkg/sub/b.ts']);
    change();
    const r = runCheckReviewReceipt({ receiptPath: dir, cwd: tmp });
    expect(r.failures.map((f) => f.code)).toEqual(clean ? [] : ['WORKTREE_DIRTY']);
  });
  it.each(rows)('self-check with a range: %s', (_n, change, clean) => {
    const dir = writeReview('phase-0', start, ['pkg/sub/b.ts']);
    change();
    const findingsPath = path.join(dir, 'bug.json');
    const r = runCheckFindingsFile({ findingsPath, base: start, head, cwd: tmp });
    expect(r.failures.map((f) => f.code)).toEqual(clean ? [] : ['WORKTREE_DIRTY']);
  });
  it('self-check without a range does not look at the tree', () => {
    const dir = writeReview('phase-0', start, ['pkg/sub/b.ts']);
    put('root.ts', 'edited\n');
    const r = runCheckFindingsFile({ findingsPath: path.join(dir, 'bug.json'), cwd: tmp });
    expect(r.failures).toEqual([]);
  });
});

/**
 * Fix 1. A phase receipt's base is recomputed: the diff.head of the nearest earlier phase-M
 * receipt, else the session's starting commit. Partition: first phase at the starting commit, a
 * narrowed base; a later phase after a reviewed one, at its head and at the starting commit; a
 * phase after one that wrote no receipt (passed over); an earlier receipt that cannot be read; no
 * starting commit; a copy outside a session.
 */
describe('a phase receipt starts where the previous reviewed phase ended', () => {
  let mid: string;
  const earlier = (label: string, body: string) => {
    const dir = path.join(session(), 'reviews', label);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'receipt.json'), body);
  };
  const codes = (dir: string, moment?: 'phase') =>
    runCheckReviewReceipt({ receiptPath: dir, cwd: tmp, ...(moment && { moment }) }).failures.map(
      (f) => f.code
    );
  beforeEach(() => {
    // start -> mid -> head: phase 0 ended at mid, the phase under review ends at head.
    g('reset', '-q', '--hard', start);
    mid = commit('mid.ts', 'm\n');
    head = commit('pkg/sub/b.ts', 'b\n');
  });
  it('first phase from the starting commit passes', () => {
    expect(codes(writeReview('phase-0', start, ['pkg/sub/b.ts']))).toEqual([]);
  });
  it('first phase from a narrower base fails PHASE_BASE_MISMATCH', () => {
    expect(codes(writeReview('phase-0', mid, ['pkg/sub/b.ts']))).toEqual(['PHASE_BASE_MISMATCH']);
  });
  it('a later phase from the previous receipt head passes', () => {
    earlier('phase-0', JSON.stringify({ diff: { base: start, head: mid } }));
    expect(codes(writeReview('phase-1', mid, ['pkg/sub/b.ts']))).toEqual([]);
  });
  it('a later phase from the starting commit fails: the previous receipt decides', () => {
    earlier('phase-0', JSON.stringify({ diff: { base: start, head: mid } }));
    const dir = writeReview('phase-1', start, ['pkg/sub/b.ts']);
    expect(codes(dir)).toEqual(['PHASE_BASE_MISMATCH']);
  });
  it('a phase that wrote no receipt is passed over', () => {
    earlier('phase-0', JSON.stringify({ diff: { base: start, head: mid } }));
    fs.mkdirSync(path.join(session(), 'reviews', 'phase-1'), { recursive: true });
    expect(codes(writeReview('phase-2', mid, ['pkg/sub/b.ts']))).toEqual([]);
  });
  it('a later phase is never measured against a phase after it', () => {
    earlier('phase-3', JSON.stringify({ diff: { base: start, head: head } }));
    expect(codes(writeReview('phase-0', start, ['pkg/sub/b.ts']))).toEqual([]);
  });
  it('an earlier receipt that cannot be read makes the base unknown', () => {
    earlier('phase-0', '{ not json');
    expect(codes(writeReview('phase-1', mid, ['pkg/sub/b.ts']))).toEqual(['PHASE_BASE_UNKNOWN']);
  });
  it('an earlier receipt without a full diff.head makes the base unknown', () => {
    earlier('phase-0', JSON.stringify({ diff: { head: 'HEAD' } }));
    expect(codes(writeReview('phase-1', mid, ['pkg/sub/b.ts']))).toEqual(['PHASE_BASE_UNKNOWN']);
  });
  it('no earlier receipt and no starting commit: unknown', () => {
    fs.writeFileSync(path.join(session(), 'autopilot-state.json'), '{}');
    expect(codes(writeReview('phase-0', start, ['pkg/sub/b.ts']))).toEqual(['PHASE_BASE_UNKNOWN']);
  });
  it('a phase receipt copied outside a session: unknown', () => {
    const dir = writeReview('phase-0', start, ['pkg/sub/b.ts']);
    const copy = path.join(tmp, '.harness', 'copy');
    fs.cpSync(dir, copy, { recursive: true });
    expect(codes(copy, 'phase')).toEqual(['PHASE_BASE_UNKNOWN']);
  });
});
