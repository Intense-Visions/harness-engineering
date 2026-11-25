import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  archiveReviewRound,
  listArchivedRounds,
  readArchivedRounds,
  type ArchiveRoundIo,
} from '../../src/receipts/rounds';
import { isReviewDirectory } from '../../src/receipts/layout';
import type { ArchivedRound } from '@harness-engineering/types';
import { validateReviewReceipt } from '../../src/receipts/review-gate';
import { HEAD, OTHER, START, codesOf, ctx, receipt } from './round4-helpers';

/** Fix rounds: the round comes from the archives, never from what the directory holds now. */
let tmp: string;
let dir: string;
beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'core-r4-rounds-'));
  dir = path.join(tmp, '.harness', 'sessions', 's1', 'reviews', 'phase-0');
  fs.mkdirSync(dir, { recursive: true });
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));
const mk = (name: string) => fs.mkdirSync(path.join(dir, name));
const put = (name: string, text = '{}') => fs.writeFileSync(path.join(dir, name), text);
/** A receipt that parses, for a round that reviewed `head`. */
const putReceipt = (head = OTHER, at = '') =>
  fs.writeFileSync(
    path.join(dir, at, 'receipt.json'),
    JSON.stringify(receipt({ diff: { base: START, head } }))
  );
const archive = (head: string | undefined = HEAD, io?: ArchiveRoundIo) =>
  archiveReviewRound(dir, { head, ...(io !== undefined && { io }) });
const listing = (d = dir) => fs.readdirSync(d).sort();

describe('listArchivedRounds: round-R directories, R a positive integer', () => {
  const rows: Array<[string, () => void, number[]]> = [
    ['no review directory', () => fs.rmSync(dir, { recursive: true }), []],
    ['empty', () => undefined, []],
    ['one', () => mk('round-1'), [1]],
    [
      'many, listed in numeric order',
      () => ['round-10', 'round-2', 'round-1'].forEach(mk),
      [1, 2, 10],
    ],
    ['a gap is listed as it is', () => ['round-1', 'round-3'].forEach(mk), [1, 3]],
    [
      'round-0, round-01, round-x and round- are not archives',
      () => ['round-0', 'round-01', 'round-x', 'round-'].forEach(mk),
      [],
    ],
    ['a file named round-2 is not an archive', () => put('round-2'), []],
  ];
  it.each(rows)('%s', (_name, arrange, expected) => {
    arrange();
    expect(listArchivedRounds(dir)).toEqual(expected);
  });
});

describe('isReviewDirectory: only the review directories of the layout', () => {
  const rows: Array<[string, string, boolean]> = [
    ['a session phase review', '.harness/sessions/s1/reviews/phase-0', true],
    ['a session final review', '.harness/sessions/s1/reviews/final-all', true],
    ['a standalone review', '.harness/reviews/main-abc', true],
    ['the repository top', '', false],
    ['a source directory', 'packages/core/src', false],
    ['the reviews directory itself', '.harness/reviews', false],
    ['a session directory', '.harness/sessions/s1', false],
    ['a session review with another label', '.harness/sessions/s1/reviews/phase-01', false],
    ['sessions outside .harness', 'elsewhere/sessions/s1/reviews/phase-0', false],
    ['a bare phase-N directory', 'phase-0', false],
    ['an archive inside a review', '.harness/sessions/s1/reviews/phase-0/round-1', false],
  ];
  it.each(rows)('%s', (_name, rel, expected) => {
    expect(isReviewDirectory(path.join(tmp, rel))).toBe(expected);
  });
});

describe('archiveReviewRound: move the ended round into round-<current>/', () => {
  it('no archives: the current files become round-1, the next review is round 2', () => {
    putReceipt();
    put('bug.json');
    expect(archive()).toEqual({ ok: true, archived: 1, next: 2 });
    expect(listing(path.join(dir, 'round-1'))).toEqual(['bug.json', 'receipt.json']);
    expect(listing()).toEqual(['round-1']);
  });
  it('round-1 exists: the current files become round-2, the next review is round 3', () => {
    mk('round-1');
    putReceipt();
    expect(archive()).toEqual({ ok: true, archived: 2, next: 3 });
    expect(listing()).toEqual(['round-1', 'round-2']);
  });
  it('a directory that does not exist is an error', () => {
    fs.rmSync(dir, { recursive: true });
    expect(archive().ok).toBe(false);
  });

  // Defect 1: a round that wrote no receipt is not a round, so there is nothing to archive.
  it.each([
    ['nothing at all', () => undefined],
    ['reviewer files but no receipt.json (a failed mechanical phase)', () => put('bug.json')],
  ])('no receipt.json (%s): refused, nothing moves', (_name, arrange) => {
    mk('round-1');
    arrange();
    const before = listing();
    const r = archive();
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/no receipt\.json/);
    expect(listing()).toEqual(before);
  });
  it('a receipt.json that is not a receipt: refused, nothing moves', () => {
    put('receipt.json', 'not json');
    const r = archive();
    expect(!r.ok && r.error).toMatch(/not a readable review receipt/);
    expect(listing()).toEqual(['receipt.json']);
  });

  // Defect 2: a path that is not a review directory never has its files moved.
  it.each([
    ['the repository top', ''],
    ['a source directory', 'src'],
    ['the reviews directory', '.harness/reviews'],
  ])('%s is not a review directory: refused, nothing moves', (_name, rel) => {
    const other = path.join(tmp, rel);
    fs.mkdirSync(other, { recursive: true });
    fs.writeFileSync(path.join(other, 'receipt.json'), JSON.stringify(receipt()));
    fs.writeFileSync(path.join(other, 'index.ts'), 'export {};');
    const before = listing(other);
    const r = archiveReviewRound(other, { head: HEAD });
    expect(!r.ok && r.error).toMatch(/is not a review directory/);
    expect(listing(other)).toEqual(before);
  });
  it('a review directory that is a symlink: refused, nothing moves', () => {
    const real = path.join(tmp, 'real');
    fs.mkdirSync(real);
    fs.writeFileSync(path.join(real, 'receipt.json'), JSON.stringify(receipt()));
    fs.rmSync(dir, { recursive: true });
    fs.symlinkSync(real, dir, 'dir');
    const r = archive();
    expect(!r.ok && r.error).toMatch(/not a directory/);
    expect(listing(real)).toEqual(['receipt.json']);
  });

  // Defect 3: the archive is all or nothing.
  it('a move that fails part-way is rolled back: the round is where it was', () => {
    putReceipt();
    put('bug.json');
    put('security.json');
    let calls = 0;
    const io: ArchiveRoundIo = {
      rename: (from, to) => {
        calls += 1;
        if (calls === 3) throw Object.assign(new Error('boom'), { code: 'EIO' });
        fs.renameSync(from, to);
      },
    };
    const r = archive(HEAD, io);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/EIO/);
    expect(listing()).toEqual(['bug.json', 'receipt.json', 'security.json']);
  });
  it('a failing final rename is rolled back too', () => {
    putReceipt();
    put('bug.json');
    const io: ArchiveRoundIo = {
      rename: (from, to) => {
        if (path.basename(to) === 'round-1') throw Object.assign(new Error('x'), { code: 'EPERM' });
        fs.renameSync(from, to);
      },
    };
    expect(archive(HEAD, io).ok).toBe(false);
    expect(listing()).toEqual(['bug.json', 'receipt.json']);
  });
  it('an interrupted archive left its staging directory: refused, nothing moves', () => {
    putReceipt();
    mk('.round-1.partial');
    const r = archive();
    expect(!r.ok && r.error).toMatch(/\.round-1\.partial/);
    expect(listing()).toEqual(['.round-1.partial', 'receipt.json']);
  });

  // Defect 4: a fix round needs a fix commit.
  it('HEAD is still the head the ended round reviewed: refused, nothing moves', () => {
    putReceipt(HEAD);
    const r = archive(HEAD);
    expect(!r.ok && r.error).toMatch(/fix commit/);
    expect(listing()).toEqual(['receipt.json']);
  });
  it('HEAD could not be resolved: refused, nothing moves', () => {
    putReceipt();
    const r = archiveReviewRound(dir, { head: undefined });
    expect(!r.ok && r.error).toMatch(/HEAD could not be resolved/);
    expect(listing()).toEqual(['receipt.json']);
  });

  // Defect 5: archives are numbered round-1..round-n.
  it('archives with a gap: refused, nothing moves', () => {
    mk('round-2');
    putReceipt();
    const r = archive();
    expect(!r.ok && r.error).toMatch(/round-1/);
    expect(listing()).toEqual(['receipt.json', 'round-2']);
  });

  it('readArchivedRounds reads each archive receipt: head and blocking, or unreadable', () => {
    mk('round-1');
    mk('round-2');
    fs.writeFileSync(
      path.join(dir, 'round-1', 'receipt.json'),
      JSON.stringify(receipt({ diff: { base: OTHER, head: OTHER }, blocking: 0 }))
    );
    fs.writeFileSync(path.join(dir, 'round-2', 'receipt.json'), 'not json');
    expect(readArchivedRounds(dir)).toEqual([
      { round: 1, head: OTHER, blocking: 0 },
      { round: 2, unreadable: true },
    ]);
  });
});

describe('the gate: round = 1 + archives, priorRounds = the archives', () => {
  const r1: ArchivedRound = { round: 1, head: OTHER, blocking: 3 };
  const r2: ArchivedRound = { round: 2, head: START, blocking: 1 };
  const prior = (...rounds: ArchivedRound[]) => rounds;
  const rows: Array<[string, ArchivedRound[], Record<string, unknown>, string[]]> = [
    ['no archives, no round', [], {}, []],
    ['no archives, round 1', [], { round: 1 }, []],
    [
      'no archives, round 2 (claims a fix round that left no archive)',
      [],
      { round: 2 },
      ['ROUND_MISMATCH'],
    ],
    [
      'one archive, no round (the round reset by a mechanical failure)',
      [r1],
      {},
      ['ROUND_MISMATCH', 'PRIOR_ROUNDS_MISMATCH'],
    ],
    ['one archive, round 2, priorRounds match', [r1], { round: 2, priorRounds: prior(r1) }, []],
    ['one archive, round 2, no priorRounds', [r1], { round: 2 }, ['PRIOR_ROUNDS_MISMATCH']],
    [
      'one archive, round 2, prior head differs',
      [r1],
      { round: 2, priorRounds: [{ round: 1, head: START, blocking: 3 }] },
      ['PRIOR_ROUNDS_MISMATCH'],
    ],
    [
      'one archive, round 2, prior blocking differs',
      [r1],
      { round: 2, priorRounds: [{ round: 1, head: OTHER, blocking: 0 }] },
      ['PRIOR_ROUNDS_MISMATCH'],
    ],
    [
      'one archive, round 2, an extra prior round',
      [r1],
      { round: 2, priorRounds: prior(r1, r2) },
      ['PRIOR_ROUNDS_MISMATCH'],
    ],
    [
      'one archive, round 2, the prior round listed twice',
      [r1],
      { round: 2, priorRounds: prior(r1, r1) },
      ['PRIOR_ROUNDS_MISMATCH'],
    ],
    ['two archives, round 3, both listed', [r1, r2], { round: 3, priorRounds: prior(r1, r2) }, []],
    [
      'two archives, round 3, listed out of order',
      [r1, r2],
      { round: 3, priorRounds: prior(r2, r1) },
      [],
    ],
    [
      'an archive without a readable receipt',
      [{ round: 1, unreadable: true }],
      { round: 2, priorRounds: [{ round: 1, head: OTHER, blocking: 0 }] },
      ['PRIOR_ROUNDS_MISMATCH'],
    ],
    // Defect 4: a new round at the same head re-rolls the review without a fix.
    [
      'round 2 at the head round 1 reviewed',
      [{ round: 1, head: HEAD, blocking: 3 }],
      { round: 2, priorRounds: [{ round: 1, head: HEAD, blocking: 3 }] },
      ['ROUND_SAME_HEAD'],
    ],
    [
      'round 3 at the head round 2 reviewed',
      [r1, { round: 2, head: HEAD, blocking: 1 }],
      { round: 3, priorRounds: [r1, { round: 2, head: HEAD, blocking: 1 }] },
      ['ROUND_SAME_HEAD'],
    ],
    // Defect 5: archives numbered out of sequence.
    [
      'a gap: only round-2 is archived',
      [{ round: 2, head: OTHER, blocking: 3 }],
      { round: 2, priorRounds: [{ round: 2, head: OTHER, blocking: 3 }] },
      ['ROUND_MISMATCH'],
    ],
    [
      'a gap: round-1 and round-3 are archived',
      [r1, { round: 3, head: START, blocking: 0 }],
      { round: 3, priorRounds: [r1, { round: 3, head: START, blocking: 0 }] },
      ['ROUND_MISMATCH'],
    ],
  ];
  it.each(rows)('%s', (_name, archivedRounds, over, expected) => {
    const r = validateReviewReceipt(receipt(over), ctx({ archivedRounds }));
    expect(codesOf(r)).toEqual(expected);
  });
  it('a caller that does not read the archives checks nothing about rounds', () => {
    expect(codesOf(validateReviewReceipt(receipt({ round: 5 }), ctx()))).toEqual([]);
  });
});
