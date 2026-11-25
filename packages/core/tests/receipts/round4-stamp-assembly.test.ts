import { describe, it, expect } from 'vitest';
import { readSessionReviewState } from '../../src/receipts/decisions';
import {
  assembleStamp,
  type ProvenanceRow,
  type ReviewDirRead,
} from '../../src/receipts/provenance';
import type { CheckedReceiptResult, PhaseReviewBase } from '../../src/receipts/review-gate';

/**
 * Round 4, fix 13. The stamp's rows and notes are assembled in core. The continuity check
 * compares a phase's base with the nearest EARLIER REVIEWED head, carried across a MISSING or
 * unread row, or with the starting commit when no earlier phase was reviewed.
 */
const sha = (c: string) => c.repeat(40);
const START = sha('0');
const result = (base: string, head: string, phaseBase?: PhaseReviewBase): CheckedReceiptResult => ({
  checked: true,
  round: 1,
  ...(phaseBase !== undefined && { phaseBase }),
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
/** A reviewed phase: its range and the base the gate demanded of it (phaseReviewBase). */
type Dir = ['ok', string, string, PhaseReviewBase] | ['unread'] | ['absent'];
const fromPhase = (phase: number, base: string): PhaseReviewBase => ({
  status: 'resolved',
  base,
  source: 'previous-phase',
  phase,
});
const fromStart = (base = START): PhaseReviewBase => ({
  status: 'resolved',
  base,
  source: 'starting-commit',
});
function assemble(dirs: Dir[]) {
  const state = readSessionReviewState(
    JSON.stringify({ startingCommit: START, phases: dirs.map((_, i) => ({ name: `P${i}` })) })
  );
  const labels = dirs.flatMap((d, i) => (d[0] === 'absent' ? [] : [`phase-${i}`]));
  const read = (label: string): ReviewDirRead => {
    const d = dirs[Number(label.slice('phase-'.length))]!;
    return d[0] === 'ok'
      ? { review: label, result: result(d[1], d[2], d[3]) }
      : { review: label, unread: { status: 'missing' } };
  };
  return assembleStamp(state, { labels, skipped: 0 }, read);
}
const gaps = (dirs: Dir[]) =>
  assemble(dirs)
    .rows.filter((r): r is ProvenanceRow => 'receipt' in r)
    .map((r) => [r.review, r.gapAfter ?? null]);

/**
 * Fix round 1 (bug-gap-ignores-reachability, adversarial-gap-uses-receipt-gate-passes-over): the
 * gap is the gate's own phase-base rule, read from the gate's result, so an earlier receipt the
 * gate passed over (off the branch after a rebase, not a valid phase receipt) is passed over here.
 */
describe("assembleStamp: the gap check is the gate's phase base", () => {
  const rows: Array<[string, Dir[], Array<[string, string | null]>]> = [
    [
      'continuous phases',
      [
        ['ok', START, sha('a'), fromStart()],
        ['ok', sha('a'), sha('b'), fromPhase(0, sha('a'))],
      ],
      [
        ['phase-0', null],
        ['phase-1', null],
      ],
    ],
    [
      'phase-0 not at the starting commit',
      [['ok', sha('9'), sha('a'), fromStart()]],
      [['phase-0', 'starting-commit']],
    ],
    [
      'a phase that skips the previous head',
      [
        ['ok', START, sha('a'), fromStart()],
        ['ok', sha('9'), sha('b'), fromPhase(0, sha('a'))],
      ],
      [
        ['phase-0', null],
        ['phase-1', 'phase-0'],
      ],
    ],
    [
      'after a MISSING phase: the nearest earlier usable receipt',
      [
        ['ok', START, sha('a'), fromStart()],
        ['absent'],
        ['ok', sha('b'), sha('c'), fromPhase(0, sha('a'))],
      ],
      [
        ['phase-0', null],
        ['phase-2', 'phase-0'],
      ],
    ],
    [
      'after a rebase: phase-0 is off the branch, the new starting commit is the base, no gap',
      [
        ['ok', sha('1'), sha('a'), fromStart(sha('1'))],
        ['ok', sha('7'), sha('c'), fromStart(sha('7'))],
      ],
      [
        ['phase-0', null],
        ['phase-1', null],
      ],
    ],
    [
      'no base could be named: no gap is claimed (the gate fails PHASE_BASE_UNKNOWN)',
      [['ok', sha('b'), sha('c'), { status: 'unresolved', reason: 'starting-commit-unknown' }]],
      [['phase-0', null]],
    ],
  ];
  it.each(rows)('%s', (_name, dirs, expected) => {
    expect(gaps(dirs)).toEqual(expected);
  });
  it('the rows include MISSING and unread rows in order, and the final review', () => {
    const out = assemble([['ok', START, sha('a')], ['absent'], ['unread']]);
    expect(out.rows.map((r) => r.review)).toEqual(['phase-0', 'phase-1', 'phase-2', 'final-all']);
  });
});
