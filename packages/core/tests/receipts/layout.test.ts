import { describe, it, expect } from 'vitest';
import {
  REVIEW_RECEIPT_FILENAME,
  phaseOfReviewLabel,
  reviewMomentOfDir,
  sessionDirOfReviewDir,
} from '../../src/receipts/layout';

describe('review artifact layout', () => {
  it('names the receipt file', () => {
    expect(REVIEW_RECEIPT_FILENAME).toBe('receipt.json');
  });
});

describe('phaseOfReviewLabel: the N of a session `phase-N` label (round 2, architecture-1)', () => {
  it.each<[string, number | undefined]>([
    ['phase-0', 0],
    ['phase-12', 12],
    ['phase-01', undefined],
    ['phase-', undefined],
    ['final-all', undefined],
    ['phase-1/', undefined],
    ['x-phase-1', undefined],
  ])('%s -> %s', (label, n) => {
    expect(phaseOfReviewLabel(label)).toBe(n);
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
    // Session layout wins over the standalone rule: a session whose slug is `.harness` holds a
    // `.harness/reviews/` pair, and its final-all is still the final review.
    ['.harness/sessions/.harness/reviews/final-all', 'final'],
    ['/abs/.harness/sessions/.harness/reviews/phase-3', 'phase'],
    ['C:\\r\\.harness\\sessions\\.harness\\reviews\\final-all', 'final'],
    // A standalone directory named like a session label is still standalone (no sessions/ above).
    ['/abs/repo/.harness/reviews/phase-0', 'standalone'],
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

describe('sessionDirOfReviewDir: the session a review directory belongs to', () => {
  it.each([
    ['/r/.harness/sessions/s1/reviews/phase-0', '/r/.harness/sessions/s1'],
    ['/r/.harness/sessions/.harness/reviews/final-all', '/r/.harness/sessions/.harness'],
    ['/r/.harness/reviews/main-abc', undefined],
    ['/r/.harness/sessions/s1/reviews/round-1', undefined],
  ])('%s -> %s', (dir, session) => {
    expect(sessionDirOfReviewDir(dir)).toBe(session);
  });
});
