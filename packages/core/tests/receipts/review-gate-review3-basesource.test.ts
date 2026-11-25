import { describe, it, expect } from 'vitest';
import { validateReviewReceipt } from '../../src/receipts/review-gate';
import { BASE, HEAD, codesOf, ctx, receipt } from './round4-helpers';

/** Review round 3, fix 7: the baseSource label is enforced. */

describe('fix 7: baseSource starting-commit is refused while a merge base resolves', () => {
  it('base is the merge base, but the receipt declares starting-commit', () => {
    const diff = { base: BASE, head: HEAD, baseSource: 'starting-commit' };
    const r = validateReviewReceipt(
      receipt({ moment: 'final', diff }),
      ctx({ mergeBase: BASE, startingCommit: BASE }, 'final')
    );
    expect(codesOf(r)).toEqual(['FINAL_BASE_NOT_MERGE_BASE']);
    expect(r.failures[0]?.message).toMatch(/baseSource starting-commit is accepted only when/);
  });
  it('positive control: declared merge-base, or no baseSource', () => {
    for (const diff of [
      { base: BASE, head: HEAD, baseSource: 'merge-base' },
      { base: BASE, head: HEAD },
    ]) {
      const r = validateReviewReceipt(receipt({ moment: 'final', diff }), ctx({}, 'final'));
      expect(codesOf(r)).toEqual([]);
    }
  });
});
