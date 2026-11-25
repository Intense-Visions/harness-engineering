import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { runCheckReviewReceipt } from '../../src/review-receipts/gate';
import { resolveFinalReviewBase } from '../../src/review-receipts/io';
import { runReviewProvenanceRender } from '../../src/commands/review-provenance';
import { formatReviewTier, runReviewTier } from '../../src/commands/review-tier';

/**
 * Round 4, fixes 1 and 2, against real git. The reviewer's reproduction: five commits, no
 * origin remote, a final-all receipt whose base is HEAD~1 and that declares starting-commit.
 */
const FULL = ['compliance', 'bug', 'security', 'architecture'];
let tmp: string;
const g = (...args: string[]) =>
  execFileSync(
    'git',
    ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args],
    { cwd: tmp, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] }
  ).trim();
let commits: string[];
const sessionDir = () => path.join(tmp, '.harness', 'sessions', 's1');
const finalDir = () => path.join(sessionDir(), 'reviews', 'final-all');

function writeReview(dir: string, base: string, head: string, files: string[]): void {
  fs.mkdirSync(dir, { recursive: true });
  const receipt = {
    schemaVersion: 1,
    moment: 'final',
    tier: 'full',
    backend: 'agent',
    diff: { base, head, baseSource: 'starting-commit' },
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
      base,
      head,
      examinedFiles: files,
      findings: [],
    };
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(file));
  }
}
const writeState = (state: unknown) => {
  fs.mkdirSync(sessionDir(), { recursive: true });
  fs.writeFileSync(path.join(sessionDir(), 'autopilot-state.json'), JSON.stringify(state));
};
const codes = (at: string, moment?: 'final') =>
  runCheckReviewReceipt({ receiptPath: at, cwd: tmp, ...(moment && { moment }) }).failures.map(
    (f) => f.code
  );

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cli-r4-final-base-')));
  g('init', '-q', '-b', 'work');
  commits = [];
  for (const n of [1, 2, 3, 4, 5]) {
    fs.writeFileSync(path.join(tmp, `f${n}.txt`), `${n}\n`);
    g('add', '--', `f${n}.txt`);
    g('commit', '-q', '--no-verify', '-m', `c${n}`);
    commits.push(g('rev-parse', 'HEAD'));
  }
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe('fix 1: a starting-commit base must be the session starting commit', () => {
  const [START, , , MID, HEAD] = [0, 1, 2, 3, 4];
  const rows: Array<[string, () => void, string[]]> = [
    [
      "base is the session's starting commit",
      () => {
        writeState({ startingCommit: commits[START], phases: [] });
        writeReview(finalDir(), commits[START]!, commits[HEAD]!, ['f2.txt']);
      },
      [],
    ],
    [
      'base is HEAD~1 (the one-commit final review, the reviewer repro)',
      () => {
        writeState({ startingCommit: commits[START], phases: [] });
        writeReview(finalDir(), commits[MID]!, commits[HEAD]!, ['f5.txt']);
      },
      ['FINAL_BASE_NOT_MERGE_BASE'],
    ],
    [
      'the state holds no startingCommit',
      () => {
        writeState({ phases: [] });
        writeReview(finalDir(), commits[START]!, commits[HEAD]!, ['f2.txt']);
      },
      ['STARTING_COMMIT_UNKNOWN'],
    ],
    [
      'the state holds an abbreviated startingCommit',
      () => {
        writeState({ startingCommit: commits[START]!.slice(0, 7), phases: [] });
        writeReview(finalDir(), commits[START]!, commits[HEAD]!, ['f2.txt']);
      },
      ['STARTING_COMMIT_UNKNOWN'],
    ],
    [
      'there is no autopilot-state.json',
      () => writeReview(finalDir(), commits[START]!, commits[HEAD]!, ['f2.txt']),
      ['STARTING_COMMIT_UNKNOWN'],
    ],
  ];
  it.each(rows)('%s', (_name, arrange, expected) => {
    arrange();
    expect(codes(finalDir())).toEqual(expected);
  });
  it('a receipt outside a session directory: the starting commit is unknown', () => {
    const elsewhere = path.join(tmp, 'copy');
    writeReview(elsewhere, commits[START]!, commits[HEAD]!, ['f2.txt']);
    expect(codes(elsewhere, 'final')).toEqual(['STARTING_COMMIT_UNKNOWN']);
  });
  it('the stamp applies the same check to the final row', () => {
    writeState({ startingCommit: commits[START], phases: [] });
    writeReview(finalDir(), commits[MID]!, commits[HEAD]!, ['f5.txt']);
    const out = runReviewProvenanceRender({ session: 's1', cwd: tmp });
    expect(out.ok && out.value.block).toMatch(
      /\| final-all \| final \|.*FAIL: FINAL_BASE_NOT_MERGE_BASE/
    );
  });
});

describe('fix 2: one resolver; review-tier prints the base the gate demands', () => {
  it('resolveFinalReviewBase: no origin and no session -> unresolved', () => {
    expect(resolveFinalReviewBase({ cwd: tmp, head: commits[4]! })).toEqual({
      status: 'unresolved',
      reason: 'starting-commit-unknown',
    });
  });
  it('resolveFinalReviewBase: no origin, session start known -> starting-commit', () => {
    expect(
      resolveFinalReviewBase({ cwd: tmp, head: commits[4]!, startingCommit: commits[0]! })
    ).toEqual({ status: 'resolved', base: commits[0], baseSource: 'starting-commit' });
  });
  it('resolveFinalReviewBase: origin/main resolves -> its merge base, whatever the session says', () => {
    g('update-ref', 'refs/remotes/origin/main', commits[1]!);
    expect(
      resolveFinalReviewBase({ cwd: tmp, head: commits[4]!, startingCommit: commits[0]! })
    ).toEqual({ status: 'resolved', base: commits[1], baseSource: 'merge-base' });
  });
  it('review-tier --moment final --session prints base and baseSource, text and json', () => {
    writeState({ startingCommit: commits[0], phases: [] });
    const out = runReviewTier({ moment: 'final', session: 's1', cwd: tmp });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.value.base).toBe(commits[0]);
    expect(out.value.baseSource).toBe('starting-commit');
    expect(formatReviewTier(out.value)).toContain(
      `Review base: ${commits[0]} (starting-commit; the gate requires exactly this base)`
    );
  });
  it('review-tier --moment final without a session and without a default branch says so', () => {
    const out = runReviewTier({ moment: 'final', cwd: tmp });
    expect(out.ok && out.value.baseUnresolved).toBe('starting-commit-unknown');
    expect(out.ok && formatReviewTier(out.value).join('\n')).toMatch(
      /Review base: unresolved \(no default-branch merge base, and the session's starting commit is unknown/
    );
  });
  it('review-tier --moment standalone prints the merge base and says the gate checks only ancestry', () => {
    g('update-ref', 'refs/remotes/origin/main', commits[1]!);
    const out = runReviewTier({ moment: 'standalone', cwd: tmp });
    expect(out.ok && out.value.base).toBe(commits[1]);
    expect(out.ok && formatReviewTier(out.value).join('\n')).toContain(
      `Review base: ${commits[1]} (merge-base; for a standalone review the gate checks only that the base is an ancestor of the head)`
    );
  });
});
