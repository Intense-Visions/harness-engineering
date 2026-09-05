/**
 * Adoption regressions (issue #1530).
 *
 * One test per surface migrated onto the denominated-metric envelope, each
 * pinning the specific green-on-empty reading it used to produce. These are the
 * tests that would have caught the bug in the first place, written against the
 * behavior rather than the mechanism — so they keep holding if the internals
 * change again.
 *
 * The mechanism's own tests live in `denominate.test.ts`, `verdict.test.ts` and
 * `render.test.ts`.
 */
import { describe, it, expect } from 'vitest';

import { patternCoverage, scoreWithCoverage } from '../../src/harness-strength/scoring';
import { verdictForMetrics } from '../../src/metrics';

describe('harness-strength: an audit with no applicable pattern abstains', () => {
  it('does not score a mode where nothing applied', () => {
    // Was: `100` — a repo with no findings, scored over zero applicable
    // patterns, reported a perfect audit with tier `solid`.
    expect(scoreWithCoverage(100, 0, 0)).toBeNull();
  });

  it('still scores normally when patterns did apply', () => {
    expect(scoreWithCoverage(100, 7, 7)).toBe(100);
    expect(scoreWithCoverage(100, 2, 7)).toBe(29);
  });

  it('exposes the coverage as a metric that abstains on an empty population', () => {
    const empty = patternCoverage(0, 0);
    expect(empty.basis).toBe('abstained');
    expect(empty.value).toBeNull();
    expect(empty.note).toMatch(/not a pass/);
  });

  it('names the exclusion that makes the denominator smaller than it looks', () => {
    // Patterns that abstained for want of an input are excluded from the
    // numerator but stay in the denominator; saying so is the point.
    expect(patternCoverage(2, 7).population.exclusions?.[0]).toMatch(/required input was absent/);
  });

  it('refuses to converge on an audit that evaluated nothing', () => {
    expect(verdictForMetrics([patternCoverage(0, 0)]).ok).toBe(false);
    expect(verdictForMetrics([patternCoverage(7, 7)]).ok).toBe(true);
  });
});
