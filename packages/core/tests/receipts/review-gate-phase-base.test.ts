import { describe, it, expect } from 'vitest';
import {
  phaseReviewBase,
  validateReviewReceipt,
  type PhaseReviewBase,
} from '../../src/receipts/review-gate';
import { BASE, OTHER, START, codesOf, ctx, receipt } from './round4-helpers';

/**
 * Fix 1. A phase review's base is not a claim: it is where the previous reviewed phase ended (the
 * `diff.head` of the nearest earlier phase-M receipt), else the session's starting commit.
 * Partition of what the caller found: not in a session; no earlier receipt and a starting commit;
 * no earlier receipt and none; an earlier receipt with a head; an earlier receipt it could not
 * read (never passed over to the starting commit); and the two sources disagreeing.
 */
describe('phaseReviewBase: the one rule', () => {
  it.each<[string, Parameters<typeof phaseReviewBase>, PhaseReviewBase]>([
    [
      'not in a session',
      [{ inSession: false, earlier: { status: 'none' }, startingCommit: START }],
      { status: 'unresolved', reason: 'not-in-session' },
    ],
    [
      'first phase: the starting commit',
      [{ inSession: true, earlier: { status: 'none' }, startingCommit: START }],
      { status: 'resolved', base: START, source: 'starting-commit' },
    ],
    [
      'first phase, no starting commit',
      [{ inSession: true, earlier: { status: 'none' }, startingCommit: undefined }],
      { status: 'unresolved', reason: 'starting-commit-unknown' },
    ],
    [
      'an earlier receipt: its head, whatever the starting commit says',
      [
        {
          inSession: true,
          earlier: { status: 'found', phase: 2, head: OTHER },
          startingCommit: START,
        },
      ],
      { status: 'resolved', base: OTHER, source: 'previous-phase', phase: 2 },
    ],
    [
      'an earlier receipt with no readable head is not passed over',
      [
        {
          inSession: true,
          earlier: { status: 'found', phase: 0, head: undefined },
          startingCommit: START,
        },
      ],
      { status: 'unresolved', reason: 'earlier-receipt-unreadable', phase: 0 },
    ],
  ])('%s', (_n, args, expected) => {
    expect(phaseReviewBase(...args)).toEqual(expected);
  });
});

describe('the receipt gate checks a phase receipt against that base', () => {
  const resolved = (base: string): PhaseReviewBase => ({
    status: 'resolved',
    base,
    source: 'starting-commit',
  });
  it.each<[string, Record<string, unknown>, PhaseReviewBase, string[]]>([
    ['phase, the prescribed base', {}, resolved(BASE), []],
    ['phase, a narrower base', {}, resolved(START), ['PHASE_BASE_MISMATCH']],
    [
      'phase, the base unknown',
      {},
      { status: 'unresolved', reason: 'starting-commit-unknown' },
      ['PHASE_BASE_UNKNOWN'],
    ],
    [
      'phase, not in a session',
      {},
      { status: 'unresolved', reason: 'not-in-session' },
      ['PHASE_BASE_UNKNOWN'],
    ],
    ['standalone: the phase rule does not apply', { moment: 'standalone' }, resolved(START), []],
  ])('%s', (_n, over, phaseBase, expected) => {
    const moment = (over.moment as 'phase' | 'standalone' | undefined) ?? 'phase';
    const r = validateReviewReceipt(receipt(over), ctx({ phaseBase }, moment));
    expect(codesOf(r)).toEqual(expected);
  });
  it('a mismatch names the prescribed base and where it came from', () => {
    const phaseBase: PhaseReviewBase = {
      status: 'resolved',
      base: OTHER,
      source: 'previous-phase',
      phase: 1,
    };
    const [f] = validateReviewReceipt(receipt(), ctx({ phaseBase })).failures;
    expect(f?.message).toContain(OTHER);
    expect(f?.message).toContain('phase-1');
  });
});
