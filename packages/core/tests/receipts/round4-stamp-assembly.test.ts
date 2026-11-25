import { describe, it, expect } from 'vitest';
import { readSessionReviewState } from '../../src/receipts/decisions';
import {
  assembleStamp,
  type ProvenanceRow,
  type ReviewDirRead,
} from '../../src/receipts/provenance';
import type { CheckedReceiptResult } from '../../src/receipts/review-gate';

/**
 * Round 4, fix 13. The stamp's rows and notes are assembled in core. The continuity check
 * compares a phase's base with the nearest EARLIER REVIEWED head, carried across a MISSING or
 * unread row, or with the starting commit when no earlier phase was reviewed.
 */
const sha = (c: string) => c.repeat(40);
const START = sha('0');
const result = (base: string, head: string): CheckedReceiptResult => ({
  checked: true,
  pass: true,
  failures: [],
  reviewersRun: 1,
  reviewersRequired: 1,
  receipt: {
    schemaVersion: 1,
    moment: 'phase',
    tier: 'light',
    backend: 'agent',
    diff: { base, head },
    coldContext: true,
    priorFindingsSupplied: false,
    reviewers: [],
    blocking: 0,
    advisory: 0,
  },
  tally: { blocking: [], advisory: 0 },
  loaded: [],
  notLoaded: [],
});
type Dir = ['ok', string, string] | ['unread'] | ['absent'];
function assemble(dirs: Dir[]) {
  const state = readSessionReviewState(
    JSON.stringify({ startingCommit: START, phases: dirs.map((_, i) => ({ name: `P${i}` })) })
  );
  const labels = dirs.flatMap((d, i) => (d[0] === 'absent' ? [] : [`phase-${i}`]));
  const read = (label: string): ReviewDirRead => {
    const d = dirs[Number(label.slice('phase-'.length))]!;
    return d[0] === 'ok'
      ? { review: label, result: result(d[1], d[2]) }
      : { review: label, unread: { status: 'missing' } };
  };
  return assembleStamp(state, { labels, skipped: 0 }, read);
}
const gaps = (dirs: Dir[]) =>
  assemble(dirs)
    .rows.filter((r): r is ProvenanceRow => typeof r !== 'string' && 'receipt' in r)
    .map((r) => [r.review, r.gapAfter ?? null]);

describe('assembleStamp: the gap check', () => {
  const rows: Array<[string, Dir[], Array<[string, string | null]>]> = [
    [
      'continuous phases',
      [
        ['ok', START, sha('a')],
        ['ok', sha('a'), sha('b')],
      ],
      [
        ['phase-0', null],
        ['phase-1', null],
      ],
    ],
    [
      'phase-0 not at the starting commit',
      [['ok', sha('9'), sha('a')]],
      [['phase-0', 'starting-commit']],
    ],
    [
      'a phase that skips the previous head',
      [
        ['ok', START, sha('a')],
        ['ok', sha('9'), sha('b')],
      ],
      [
        ['phase-0', null],
        ['phase-1', 'phase-0'],
      ],
    ],
    [
      'after a MISSING phase: compared with the nearest earlier reviewed head (gap)',
      [['ok', START, sha('a')], ['absent'], ['ok', sha('b'), sha('c')]],
      [
        ['phase-0', null],
        ['phase-2', 'phase-0'],
      ],
    ],
    [
      'after a MISSING phase: no gap when it starts where the last reviewed phase ended',
      [['ok', START, sha('a')], ['absent'], ['ok', sha('a'), sha('c')]],
      [
        ['phase-0', null],
        ['phase-2', null],
      ],
    ],
    [
      'after an unread phase: compared with the nearest earlier reviewed head',
      [['ok', START, sha('a')], ['unread'], ['ok', sha('b'), sha('c')]],
      [
        ['phase-0', null],
        ['phase-2', 'phase-0'],
      ],
    ],
    [
      'no earlier phase was reviewed: compared with the starting commit',
      [['absent'], ['ok', sha('b'), sha('c')]],
      [['phase-1', 'starting-commit']],
    ],
  ];
  it.each(rows)('%s', (_name, dirs, expected) => {
    expect(gaps(dirs)).toEqual(expected);
  });
  it('the rows include MISSING and unread rows in order, and the final review', () => {
    const out = assemble([['ok', START, sha('a')], ['absent'], ['unread']]);
    expect(out.rows.map((r) => (typeof r === 'string' ? r : r.review))).toEqual([
      'phase-0',
      'phase-1',
      'phase-2',
      'final-all',
    ]);
  });
});
