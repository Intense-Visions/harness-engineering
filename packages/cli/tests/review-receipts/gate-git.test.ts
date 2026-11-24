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
