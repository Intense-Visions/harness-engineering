import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCheckFindingsFile, runCheckReviewReceipt } from '../../src/review-receipts/gate';
import { handleCheckReviewReceipt } from '../../src/mcp/tools/review-receipt';
import { listDiffFiles, runGitIn } from '../../src/review-receipts/io';

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
 * phase after one that wrote no receipt (passed over); an earlier receipt that cannot be read or
 * whose head a rebase left off the branch (passed over, round 2); a starting commit off the
 * branch; no starting commit; a copy outside a session.
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
  it.each([
    ['cannot be read', '{ not json'],
    ['holds no full diff.head', JSON.stringify({ diff: { head: 'HEAD' } })],
  ])('round 2: an earlier receipt that %s is passed over to the starting commit', (_n, body) => {
    earlier('phase-0', body);
    expect(codes(writeReview('phase-1', start, ['pkg/sub/b.ts']))).toEqual([]);
    expect(codes(writeReview('phase-1', mid, ['pkg/sub/b.ts']))).toEqual(['PHASE_BASE_MISMATCH']);
  });
  it('round 2: an unreadable receipt is passed over to the next earlier readable one', () => {
    earlier('phase-0', JSON.stringify({ diff: { base: start, head: mid } }));
    earlier('phase-1', '{ not json');
    expect(codes(writeReview('phase-2', mid, ['pkg/sub/b.ts']))).toEqual([]);
  });
  /** A commit off the reviewed branch: what an earlier receipt's head becomes after a rebase. */
  const offBranch = () => {
    g('checkout', '-q', '-b', 'side', start);
    const side = commit('side.ts', 's\n');
    g('checkout', '-q', '-');
    return side;
  };
  it('round 2: after a rebase an earlier receipt whose head is not an ancestor is passed over', () => {
    earlier('phase-0', JSON.stringify({ diff: { base: start, head: offBranch() } }));
    expect(codes(writeReview('phase-1', start, ['pkg/sub/b.ts']))).toEqual([]);
  });
  it('round 2: a starting commit that is not an ancestor fails PHASE_BASE_UNKNOWN: record the new one', () => {
    const side = offBranch();
    fs.writeFileSync(
      path.join(session(), 'autopilot-state.json'),
      JSON.stringify({ startingCommit: side })
    );
    const r = runCheckReviewReceipt({
      receiptPath: writeReview('phase-0', start, ['pkg/sub/b.ts']),
      cwd: tmp,
    });
    expect(r.failures.map((f) => f.code)).toEqual(['PHASE_BASE_UNKNOWN']);
    expect(r.failures[0]?.message).toMatch(/record the new starting commit/);
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

/**
 * Round 2, fix 4 (bug-1). The gate asks git in the receipt's repository, not the caller's: a lane
 * worktree under the main checkout (as `_wt/` is here) is gated against its own HEAD and tree.
 * Partition: the lane clean from the main checkout's cwd (CLI and MCP tool), and the lane dirty
 * while the main checkout is clean.
 */
describe('round 2: the gate runs git in the worktree that holds the receipt', () => {
  let lane: string;
  let laneHead: string;
  const lg = (...args: string[]) =>
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
      cwd: lane,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const laneReview = () => {
    const dir = path.join(lane, '.harness', 'sessions', 's1', 'reviews', 'phase-0');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(lane, '.harness', 'sessions', 's1', 'autopilot-state.json'),
      JSON.stringify({ startingCommit: head })
    );
    const file = (id: string) => ({
      schemaVersion: 1,
      reviewerId: id,
      head: laneHead,
      examinedFiles: ['lane.ts'],
      findings: [],
    });
    for (const id of FULL) fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(file(id)));
    const receipt = {
      schemaVersion: 1,
      moment: 'phase',
      tier: 'full',
      backend: 'agent',
      diff: { base: head, head: laneHead },
      coldContext: true,
      priorFindingsSupplied: false,
      reviewers: FULL.map((id) => ({ id, required: true, ran: true, findingsPath: `${id}.json` })),
      blocking: 0,
      advisory: 0,
    };
    fs.writeFileSync(path.join(dir, 'receipt.json'), JSON.stringify(receipt));
    return dir;
  };
  beforeEach(() => {
    lane = path.join(tmp, '_wt', 'lane');
    g('worktree', 'add', '-q', '-b', 'lane', lane, head);
    fs.writeFileSync(path.join(lane, 'lane.ts'), 'l\n');
    lg('add', '--', 'lane.ts');
    lg('commit', '-q', '--no-verify', '-m', 'lane');
    laneHead = lg('rev-parse', 'HEAD');
  });
  it('a clean lane receipt passes when the gate runs from the main checkout', () => {
    const r = runCheckReviewReceipt({ receiptPath: laneReview(), cwd: tmp });
    expect(r.failures).toEqual([]);
  });
  it('the MCP tool, with path the main checkout, gates the lane against the lane', async () => {
    const res = await handleCheckReviewReceipt({ path: tmp, receipt: laneReview() });
    expect(JSON.parse(res.content[0]?.text ?? '{}')).toMatchObject({ pass: true });
  });
  it('a dirty lane fails WORKTREE_DIRTY though the main checkout is clean', () => {
    const dir = laneReview();
    fs.writeFileSync(path.join(lane, 'lane.ts'), 'edited\n');
    const r = runCheckReviewReceipt({ receiptPath: dir, cwd: tmp });
    expect(r.failures.map((f) => f.code)).toEqual(['WORKTREE_DIRTY']);
  });
});

/**
 * Round 2 (typescript-strict): `-z` output is split as git printed it. Trimming the whole output
 * rewrote a first changed path that starts with whitespace, so a reviewer listing the real path
 * failed EXAMINED_OUTSIDE_DIFF.
 */
describe('round 2: a changed path that starts with a space is listed as git printed it', () => {
  it('listDiffFiles and the gate keep the leading space', () => {
    const lead = commit(' lead.ts', 'x\n');
    expect(listDiffFiles(runGitIn, head, lead, tmp)).toEqual([' lead.ts']);
    head = lead;
    const r = runCheckReviewReceipt({
      receiptPath: writeReview('phase-0', start, [' lead.ts']),
      cwd: tmp,
    });
    expect(r.failures).toEqual([]);
  });
});
