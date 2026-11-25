import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  archiveReviewRound,
  listArchivedRounds,
  listInterruptedArchives,
  readArchivedRounds,
  type ArchiveRoundIo,
} from '../../src/receipts/rounds';
import { isReviewDirectory } from '../../src/receipts/layout';
import type { ArchivedRound } from '@harness-engineering/types';
import { validateReviewReceipt } from '../../src/receipts/review-gate';
import {
  FULL,
  HEAD,
  OTHER,
  START,
  codesOf,
  ctx,
  finding,
  findingsText,
  receipt,
  record,
} from './round4-helpers';

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
/**
 * The reviewers of a receipt whose ran reviewers name `files` as their findings files. With none,
 * one reviewer that did not run, so the receipt names no findings file.
 */
const reviewersNaming = (files: readonly string[]) =>
  files.length === 0
    ? [{ id: 'bug', required: true, ran: false }]
    : files.map((f) =>
        record(f.replace(/\.json$/, '').replace(/[^a-z0-9-]/g, '-'), { findingsPath: f })
      );
/** The text of a receipt that parses, for a round that reviewed `head`. */
const receiptText = (head = OTHER, files: readonly string[] = [], over = {}) =>
  JSON.stringify(
    receipt({ diff: { base: START, head }, reviewers: reviewersNaming(files), ...over })
  );
/** A receipt that parses, for a round that reviewed `head`, naming `files` as findings files. */
const putReceipt = (head = OTHER, at = '', files: readonly string[] = []) =>
  fs.writeFileSync(path.join(dir, at, 'receipt.json'), receiptText(head, files));
/** An archived round at `round-<n>/`: a receipt at OTHER and one findings file per reviewer. */
const putArchivedRound = (
  n: number,
  over: Record<string, unknown>,
  findings: Record<string, unknown[]>
) => {
  const at = path.join(dir, `round-${n}`);
  fs.writeFileSync(
    path.join(at, 'receipt.json'),
    JSON.stringify(receipt({ diff: { base: START, head: OTHER }, ...over }))
  );
  for (const id of FULL) {
    fs.writeFileSync(path.join(at, `${id}.json`), findingsText(id, findings[id] ?? []));
  }
};
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

  it('receipt.json moves last, so an interruption before the end leaves the receipt in place', () => {
    putReceipt();
    put('architecture.json');
    put('security.json');
    put('typescript-strict.json');
    const order: string[] = [];
    const io: ArchiveRoundIo = {
      rename: (from, to) => {
        order.push(path.basename(from));
        fs.renameSync(from, to);
      },
    };
    expect(archive(HEAD, io).ok).toBe(true);
    expect(order.slice(-2)).toEqual(['receipt.json', '.round-1.partial']);
  });
  it('a roll-back that fails too reports the original error and its own', () => {
    putReceipt();
    put('bug.json');
    const io: ArchiveRoundIo = {
      rename: (from, to) => {
        if (path.basename(from) === 'receipt.json') {
          throw Object.assign(new Error('x'), { code: 'EIO' });
        }
        if (path.basename(path.dirname(from)) === '.round-1.partial') {
          throw Object.assign(new Error('y'), { code: 'EACCES' });
        }
        fs.renameSync(from, to);
      },
    };
    const r = archive(HEAD, io);
    expect(!r.ok && r.error).toMatch(
      /the archive failed \(EIO\) and could not be undone \(EACCES\)/
    );
  });
  it('a roll-back moves receipt.json back first, so one it cannot finish leaves no staged receipt', () => {
    put('architecture.json');
    put('bug.json');
    putReceipt();
    const back: string[] = [];
    const io: ArchiveRoundIo = {
      rename: (from, to) => {
        if (path.basename(to) === 'round-1') throw Object.assign(new Error('x'), { code: 'EIO' });
        if (path.basename(path.dirname(from)) === '.round-1.partial') {
          back.push(path.basename(from));
        }
        fs.renameSync(from, to);
      },
    };
    expect(archive(HEAD, io).ok).toBe(false);
    expect(back[0]).toBe('receipt.json');
    expect(listing()).toEqual(['architecture.json', 'bug.json', 'receipt.json']);
  });
  // A findings file the archive would not move: the round could not be archived whole.
  it.each([
    [
      'in a subdirectory',
      'sub/bug.json',
      () => {
        mk('sub');
        fs.writeFileSync(path.join(dir, 'sub', 'bug.json'), '{}');
      },
    ],
    ['absent', 'bug.json', () => undefined],
    [
      'a symlink',
      'bug.json',
      () => {
        fs.writeFileSync(path.join(tmp, 'elsewhere.json'), '{}');
        fs.symlinkSync(path.join(tmp, 'elsewhere.json'), path.join(dir, 'bug.json'));
      },
    ],
    ['a directory', 'bug.json', () => mk('bug.json')],
  ])(
    "a ran reviewer's findings file %s: refused, naming it, nothing moves",
    (_n, file, arrange) => {
      arrange();
      putReceipt(OTHER, '', [file]);
      const before = listing();
      const r = archive();
      expect(!r.ok && r.error).toMatch(
        new RegExp(
          `names ${file.replace('.', '\\.')} as a findings file, which is not a regular file directly in`
        )
      );
      expect(listing()).toEqual(before);
    }
  );
  it('the findings files the receipt names, directly in the directory: archived', () => {
    put('bug.json');
    put('hook-x.json');
    putReceipt(OTHER, '', ['bug.json', 'bug.json']);
    expect(archive()).toEqual({ ok: true, archived: 1, next: 2 });
    expect(listing(path.join(dir, 'round-1'))).toEqual(['bug.json', 'hook-x.json', 'receipt.json']);
  });
  it.each([
    [
      'a symlink',
      () => fs.symlinkSync(path.join(tmp, 'elsewhere.json'), path.join(dir, 'receipt.json')),
    ],
    ['a directory', () => mk('receipt.json')],
  ])('a receipt.json that is %s: refused, nothing moves', (_name, arrange) => {
    fs.writeFileSync(
      path.join(tmp, 'elsewhere.json'),
      JSON.stringify(receipt({ diff: { base: START, head: OTHER } }))
    );
    arrange();
    put('bug.json');
    const before = listing();
    const r = archive();
    expect(r.ok).toBe(false);
    expect(listing()).toEqual(before);
    expect(fs.existsSync(path.join(dir, 'round-1'))).toBe(false);
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

  it('readArchivedRounds: the head from the archived receipt, blocking recounted from its findings', () => {
    mk('round-1');
    mk('round-2');
    mk('round-3');
    // The archived receipt claims 0 blocking; its findings files hold 2 (and 1 advisory).
    putArchivedRound(1, { blocking: 0 }, { bug: [finding('b1'), finding('b2', 'suggestion')] });
    fs.writeFileSync(
      path.join(dir, 'round-1', 'security.json'),
      findingsText('security', [finding('s1', 'critical')])
    );
    fs.writeFileSync(path.join(dir, 'round-2', 'receipt.json'), 'not json');
    // A receipt that parses, but a findings file it names is absent: its own blocking count.
    putArchivedRound(3, { blocking: 4 }, { bug: [finding('b1')] });
    fs.rmSync(path.join(dir, 'round-3', 'security.json'));
    expect(readArchivedRounds(dir)).toEqual([
      { round: 1, head: OTHER, blocking: 2 },
      { round: 2, unreadable: true },
      { round: 3, head: OTHER, blocking: 4 },
    ]);
  });
  it("readArchivedRounds: a findings file that is not a findings file: the receipt's own count", () => {
    mk('round-1');
    putArchivedRound(1, { blocking: 5 }, {});
    fs.writeFileSync(path.join(dir, 'round-1', 'bug.json'), '{"not":"findings"}');
    expect(readArchivedRounds(dir)).toEqual([{ round: 1, head: OTHER, blocking: 5 }]);
  });
  it('readArchivedRounds: a findings file two reviewers name is counted once', () => {
    mk('round-1');
    fs.writeFileSync(
      path.join(dir, 'round-1', 'receipt.json'),
      JSON.stringify(
        receipt({
          diff: { base: START, head: OTHER },
          reviewers: [record('bug'), record('security', { findingsPath: 'bug.json' })],
        })
      )
    );
    fs.writeFileSync(path.join(dir, 'round-1', 'bug.json'), findingsText('bug', [finding('b1')]));
    expect(readArchivedRounds(dir)).toEqual([{ round: 1, head: OTHER, blocking: 1 }]);
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

describe('an interrupted archive: the gate fails, the next archive finishes or undoes it', () => {
  const staging = (n = 1) => path.join(dir, `.round-${n}.partial`);
  /**
   * The state a process killed mid-archive leaves: `staged` in staging, the rest in place. A staged
   * receipt names `names` as its findings files (by default, the other staged files).
   */
  const crashed = (
    staged: string[],
    inPlace: string[],
    n = 1,
    names = staged.filter((f) => f !== 'receipt.json')
  ) => {
    fs.mkdirSync(staging(n));
    for (const name of staged) {
      const text = name === 'receipt.json' ? receiptText(OTHER, names) : '{}';
      fs.writeFileSync(path.join(staging(n), name), text);
    }
    for (const name of inPlace) {
      if (name === 'receipt.json') putReceipt();
      else put(name);
    }
  };

  it('listInterruptedArchives lists every .round-*.partial, and nothing else', () => {
    mk('.round-1.partial');
    mk('.round-x.partial');
    mk('round-1');
    put('receipt.json');
    expect(listInterruptedArchives(dir)).toEqual(['.round-1.partial', '.round-x.partial']);
  });
  it('the staging directory holds the receipt (killed before the last rename): the archive is completed', () => {
    crashed(['bug.json', 'security.json', 'receipt.json'], []);
    expect(archive()).toEqual({ ok: true, archived: 1, next: 2, interrupted: 'completed' });
    expect(listing()).toEqual(['round-1']);
    expect(listing(path.join(dir, 'round-1'))).toEqual([
      'bug.json',
      'receipt.json',
      'security.json',
    ]);
  });
  it('the receipt is still in place (killed mid-move): the staged files go back, then the round is archived', () => {
    crashed(['bug.json'], ['receipt.json', 'security.json']);
    expect(archive()).toEqual({ ok: true, archived: 1, next: 2, interrupted: 'undone' });
    expect(listing()).toEqual(['round-1']);
    expect(listing(path.join(dir, 'round-1'))).toEqual([
      'bug.json',
      'receipt.json',
      'security.json',
    ]);
  });
  it('the staging directory holds the receipt and a newer attempt wrote files of the same names: still completed', () => {
    crashed(['bug.json', 'receipt.json'], ['receipt.json', 'bug.json', 'security.json']);
    fs.writeFileSync(path.join(dir, 'bug.json'), 'newer');
    expect(archive()).toEqual({ ok: true, archived: 1, next: 2, interrupted: 'completed' });
    expect(listing()).toEqual(['bug.json', 'receipt.json', 'round-1', 'security.json']);
    expect(listing(path.join(dir, 'round-1'))).toEqual(['bug.json', 'receipt.json']);
    expect(fs.readFileSync(path.join(dir, 'bug.json'), 'utf-8')).toBe('newer');
    expect(fs.readFileSync(path.join(dir, 'round-1', 'bug.json'), 'utf-8')).toBe('{}');
  });
  it('the staged receipt names a findings file the staging directory does not hold: refused, nothing moves', () => {
    crashed(['receipt.json'], ['bug.json'], 1, ['bug.json']);
    const before = { here: listing(), staged: listing(staging()) };
    const r = archive();
    expect(!r.ok && r.error).toMatch(
      /the receipt in \.round-1\.partial names bug\.json as a findings file, but \.round-1\.partial does not hold it; nothing was moved/
    );
    expect(!r.ok && r.error).toMatch(/stop for the human/);
    expect({ here: listing(), staged: listing(staging()) }).toEqual(before);
  });
  it('the staged receipt is not a readable receipt: refused, nothing moves', () => {
    crashed(['bug.json'], []);
    fs.writeFileSync(path.join(staging(), 'receipt.json'), 'not json');
    const r = archive();
    expect(!r.ok && r.error).toMatch(
      /\.round-1\.partial holds a receipt\.json that is not a readable review receipt/
    );
    expect(listing(staging())).toEqual(['bug.json', 'receipt.json']);
  });
  it('undone, then refused (no fix commit): the files are back and the staging directory is gone', () => {
    crashed(['bug.json'], ['receipt.json']);
    const r = archive(OTHER);
    expect(!r.ok && r.error).toMatch(
      /^undid an interrupted archive of round 1; then HEAD is still/
    );
    expect(listing()).toEqual(['bug.json', 'receipt.json']);
  });
  it('undoing, a name in both places (a newer attempt wrote it): refused, naming it, nothing moves', () => {
    crashed(['bug.json'], ['receipt.json', 'bug.json']);
    const before = { here: listing(), staged: listing(staging()) };
    const r = archive();
    const error = r.ok ? '' : r.error;
    expect(error).toMatch(
      /\.round-1\.partial holds bug\.json, which the review directory also holds/
    );
    expect(error).toMatch(/the staged files belong to round 1, the round being archived/);
    expect(error).toMatch(/the review directory's copies belong to a newer attempt/);
    expect(error).toMatch(/stop for the human/);
    expect(error).not.toMatch(/remove|delete/);
    expect({ here: listing(), staged: listing(staging()) }).toEqual(before);
  });
  it('a staging directory that is not the next archive: refused, nothing moves', () => {
    crashed(['receipt.json'], [], 2);
    const r = archive();
    expect(!r.ok && r.error).toMatch(
      /\.round-2\.partial .* is not the staging directory of the next archive \(\.round-1\.partial\)/
    );
    expect(listing()).toEqual(['.round-2.partial']);
  });
  it.each([
    ['beside a receipt (killed mid-move)', undefined],
    ['when the round check is not read', []],
  ])('the gate fails while a staging directory exists (%s)', (_name, archivedRounds) => {
    const r = validateReviewReceipt(
      receipt(),
      ctx({
        interruptedArchives: ['.round-1.partial'],
        ...(archivedRounds !== undefined && { archivedRounds }),
      })
    );
    expect(codesOf(r)).toEqual(['ROUND_ARCHIVE_INTERRUPTED']);
    expect(r.failures[0]?.message).toMatch(/--archive-round/);
  });
  it('the gate fails beside a receipt that does not parse, too', () => {
    const r = validateReviewReceipt(
      { schemaVersion: 1 },
      ctx({ interruptedArchives: ['.round-1.partial'] })
    );
    expect(codesOf(r)).toEqual(['RECEIPT_INVALID', 'ROUND_ARCHIVE_INTERRUPTED']);
  });
  it('no staging directory: no failure', () => {
    const r = validateReviewReceipt(
      receipt(),
      ctx({ interruptedArchives: [], archivedRounds: [] })
    );
    expect(codesOf(r)).toEqual([]);
  });
});
