import { describe, it, expect } from 'vitest';
import { SESSION_REVIEW_LABEL, reviewMomentOfDir } from '../../src/receipts/layout';

/** Round 4, fix 3: review labels are the strict layout pattern; free text is inert. */
describe('SESSION_REVIEW_LABEL: phase-N (no leading zero) or final-all, nothing else', () => {
  const rows: Array<[string, boolean]> = [
    ['phase-0', true],
    ['phase-1', true],
    ['phase-12', true],
    ['final-all', true],
    ['', false],
    ['phase-', false],
    ['phase-01', false],
    ['phase-00', false],
    ['phase--1', false],
    ['phase-1.5', false],
    ['phase-a', false],
    ['phase-0._www.evil.com', false],
    ['phase-0__bold__', false],
    ['final-all-2', false],
    ['FINAL-ALL', false],
    ['phase-0\n', false],
    [`phase-${'9'.repeat(400)}`, false],
  ];
  it.each(rows)('%j -> %s', (label, ok) => {
    expect(SESSION_REVIEW_LABEL.test(label)).toBe(ok);
  });
  it('a directory named with a lax label states no moment', () => {
    expect(reviewMomentOfDir('/s/reviews/phase-0._www.evil.com')).toBeUndefined();
    expect(reviewMomentOfDir('/s/reviews/phase-01')).toBeUndefined();
    expect(reviewMomentOfDir('/s/reviews/phase-3')).toBe('phase');
  });
});
