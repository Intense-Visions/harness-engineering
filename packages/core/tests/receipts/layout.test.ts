import { describe, it, expect } from 'vitest';
import { REVIEW_RECEIPT_FILENAME, reviewMomentOfDir } from '../../src/receipts/layout';

describe('review artifact layout', () => {
  it('names the receipt file', () => {
    expect(REVIEW_RECEIPT_FILENAME).toBe('receipt.json');
  });
});

describe('reviewMomentOfDir: the moment a review directory states', () => {
  it.each([
    ['.harness/sessions/s1/reviews/final-all', 'final'],
    ['.harness/sessions/s1/reviews/phase-0', 'phase'],
    ['/abs/repo/.harness/sessions/s1/reviews/phase-2/', 'phase'],
    ['.harness/reviews/feat-x-abc123', 'standalone'],
    ['/abs/repo/.harness/reviews/final-all', 'standalone'],
    ['C:\\repo\\.harness\\sessions\\s1\\reviews\\final-all', 'final'],
    ['C:\\repo\\.harness\\reviews\\main-abc', 'standalone'],
  ])('%s is a %s review', (dir, moment) => {
    expect(reviewMomentOfDir(dir)).toBe(moment);
  });
  it.each([
    '.harness/sessions/s1/reviews/round-2',
    '/tmp/x',
    'phase-',
    'reviews/final-all-old',
    '/s/reviews/phase-2b',
  ])('%s does not say', (dir) => {
    expect(reviewMomentOfDir(dir)).toBeUndefined();
  });
});
