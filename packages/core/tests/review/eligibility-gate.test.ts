import { describe, it, expect } from 'vitest';
import { checkEligibility } from '../../src/review/eligibility-gate';
import type { PrMetadata } from '../../src/review/types';

/** Helper: returns a valid open PR with no skip conditions */
function openPr(overrides: Partial<PrMetadata> = {}): PrMetadata {
  return {
    state: 'open',
    isDraft: false,
    changedFiles: ['src/index.ts', 'src/utils.ts'],
    headSha: 'abc1234',
    priorReviews: [],
    ...overrides,
  };
}

describe('checkEligibility', () => {
  // --- CI mode off: always eligible ---

  it('returns eligible when ciMode is false regardless of PR state', () => {
    const result = checkEligibility(openPr({ state: 'closed' }), false);
    expect(result).toEqual({ eligible: true });
  });

  // --- PR state checks ---

  it('returns ineligible when PR is closed', () => {
    const result = checkEligibility(openPr({ state: 'closed' }), true);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PR is closed');
  });

  it('returns ineligible when PR is merged', () => {
    const result = checkEligibility(openPr({ state: 'merged' }), true);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PR is merged');
  });

  // --- Draft check ---

  it('returns ineligible when PR is a draft', () => {
    const result = checkEligibility(openPr({ isDraft: true }), true);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PR is a draft');
  });

  // --- Trivial change check ---

  it('returns ineligible when all changed files are .md', () => {
    const result = checkEligibility(
      openPr({ changedFiles: ['README.md', 'docs/guide.md', 'CHANGELOG.md'] }),
      true
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Trivial change: documentation only');
  });

  it('returns eligible when some files are .md but not all', () => {
    const result = checkEligibility(openPr({ changedFiles: ['README.md', 'src/index.ts'] }), true);
    expect(result.eligible).toBe(true);
  });

  it('returns eligible when no files are changed (edge case)', () => {
    const result = checkEligibility(openPr({ changedFiles: [] }), true);
    expect(result.eligible).toBe(true);
  });

  // --- Already reviewed check ---

  it('returns ineligible when headSha matches a prior review', () => {
    const result = checkEligibility(
      openPr({
        headSha: 'abc1234',
        priorReviews: [{ headSha: 'abc1234', reviewedAt: '2026-03-21T00:00:00Z' }],
      }),
      true
    );
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('Already reviewed at abc1234');
  });

  it('returns eligible when headSha does not match any prior review', () => {
    const result = checkEligibility(
      openPr({
        headSha: 'def5678',
        priorReviews: [{ headSha: 'abc1234', reviewedAt: '2026-03-21T00:00:00Z' }],
      }),
      true
    );
    expect(result.eligible).toBe(true);
  });

  // --- Happy path ---

  it('returns eligible for an open non-draft PR with code changes and no prior review', () => {
    const result = checkEligibility(openPr(), true);
    expect(result.eligible).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  // --- Priority: first failing check wins ---

  it('checks state before draft (closed draft returns closed reason)', () => {
    const result = checkEligibility(openPr({ state: 'closed', isDraft: true }), true);
    expect(result.eligible).toBe(false);
    expect(result.reason).toBe('PR is closed');
  });
});
