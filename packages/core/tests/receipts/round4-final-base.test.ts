import { describe, it, expect } from 'vitest';
import { finalReviewBase, validateReviewReceipt } from '../../src/receipts/review-gate';
import { BASE, HEAD, OTHER, START, codesOf, ctx, findingsText, receipt } from './round4-helpers';

/** Findings files reviewed from `base`, so a row tests the final base and nothing else. */
const from = (base: string) => ({
  readFindings: (p: string) => findingsText(p.replace(/\.json$/, ''), [], base),
});

/**
 * Round 4, fix 1. The final review's base. Inputs: the default-branch merge base {resolves,
 * unresolved}, the declared baseSource {absent, merge-base, starting-commit}, the session's
 * starting commit {unknown, the declared base, another commit}. Rows where two sources disagree
 * are the point: a declared starting commit is accepted only when it IS the session's.
 */
describe('finalReviewBase: the one rule for the base a final review must have', () => {
  it.each([
    [BASE, undefined, { status: 'resolved', base: BASE, baseSource: 'merge-base' }],
    [BASE, START, { status: 'resolved', base: BASE, baseSource: 'merge-base' }],
    [undefined, START, { status: 'resolved', base: START, baseSource: 'starting-commit' }],
    [undefined, undefined, { status: 'unresolved', reason: 'starting-commit-unknown' }],
  ] as const)('merge base %s, starting commit %s', (mergeBase, startingCommit, expected) => {
    expect(finalReviewBase(mergeBase, startingCommit)).toEqual(expected);
  });
});

type Row = [
  name: string,
  mergeBase: string | undefined,
  base: string,
  baseSource: 'merge-base' | 'starting-commit' | undefined,
  startingCommit: string | undefined,
  codes: string[],
];
const rows: Row[] = [
  ['merge base resolves, base is it', BASE, BASE, undefined, undefined, []],
  // Review round 3, fix 7: the label is checked too; it was accepted here before.
  [
    'merge base resolves, base is it, declared starting-commit',
    BASE,
    BASE,
    'starting-commit',
    START,
    ['FINAL_BASE_NOT_MERGE_BASE'],
  ],
  [
    'merge base resolves, base differs',
    BASE,
    OTHER,
    undefined,
    undefined,
    ['FINAL_BASE_NOT_MERGE_BASE'],
  ],
  [
    'merge base resolves, base is the starting commit (sources disagree: merge base wins)',
    BASE,
    START,
    'starting-commit',
    START,
    ['FINAL_BASE_NOT_MERGE_BASE'],
  ],
  [
    'unresolved, starting-commit equals the session start',
    undefined,
    START,
    'starting-commit',
    START,
    [],
  ],
  [
    'unresolved, starting-commit is another commit (the one-commit final review)',
    undefined,
    OTHER,
    'starting-commit',
    START,
    ['FINAL_BASE_NOT_MERGE_BASE'],
  ],
  [
    'unresolved, starting-commit declared, the starting commit is unknown',
    undefined,
    START,
    'starting-commit',
    undefined,
    ['STARTING_COMMIT_UNKNOWN'],
  ],
  ['unresolved, no baseSource', undefined, START, undefined, START, ['FINAL_BASE_NOT_MERGE_BASE']],
  [
    'unresolved, baseSource merge-base',
    undefined,
    START,
    'merge-base',
    START,
    ['FINAL_BASE_NOT_MERGE_BASE'],
  ],
];

describe('the gate applies finalReviewBase to a final receipt', () => {
  it.each(rows)('%s', (_name, mergeBase, base, baseSource, startingCommit, codes) => {
    const diff = { base, head: HEAD, ...(baseSource !== undefined && { baseSource }) };
    const r = validateReviewReceipt(
      receipt({ moment: 'final', diff }),
      ctx(
        { mergeBase, ...(startingCommit !== undefined && { startingCommit }), ...from(base) },
        'final'
      )
    );
    expect(codesOf(r)).toEqual(codes);
  });
  it('names the session starting commit when a declared starting commit is another', () => {
    const diff = { base: OTHER, head: HEAD, baseSource: 'starting-commit' };
    const r = validateReviewReceipt(
      receipt({ moment: 'final', diff }),
      ctx({ mergeBase: undefined, startingCommit: START, ...from(OTHER) }, 'final')
    );
    expect(r.failures[0]?.message).toBe(
      `a final review starts at the merge base, but diff.base is ${OTHER} and the default ` +
        `branch could not be resolved, so the base must be the session's starting commit ${START}`
    );
  });
  it('says why the starting commit is unknown', () => {
    const diff = { base: OTHER, head: HEAD, baseSource: 'starting-commit' };
    const r = validateReviewReceipt(
      receipt({ moment: 'final', diff }),
      ctx({ mergeBase: undefined, ...from(OTHER) }, 'final')
    );
    expect(r.failures[0]?.message).toMatch(/session's starting commit is unknown/);
  });
  it('a phase receipt is not checked against the final rule (its own base rule is phaseReviewBase)', () => {
    const phaseBase = { status: 'resolved', base: OTHER, source: 'starting-commit' } as const;
    const r = validateReviewReceipt(
      receipt({ diff: { base: OTHER, head: HEAD } }),
      ctx({ phaseBase, ...from(OTHER) })
    );
    expect(codesOf(r)).toEqual([]);
  });
});
