import { describe, expect, it } from 'vitest';

import {
  scoreBuildQuality,
  BUILD_QUALITY,
  type HarnessFitResult,
} from '../../src/capability/harness-fit.js';

/** Baseline result: converged on the first attempt, acted (tool calls + a file). */
function result(overrides: Partial<HarnessFitResult> = {}): HarnessFitResult {
  return {
    converged: true,
    toolCalls: 5,
    filesTouched: 2,
    retries: 0,
    ...overrides,
  };
}

describe('scoreBuildQuality — fail-open (SC1, D6)', () => {
  it('an errored probe ⇒ undefined (no ranking effect)', () => {
    expect(scoreBuildQuality(result({ error: 'timeout' }))).toBeUndefined();
    // Even a "converged"-looking result with an error is fail-open.
    expect(scoreBuildQuality(result({ converged: true, error: 'pull failed' }))).toBeUndefined();
  });
});

describe('scoreBuildQuality — converged ⇒ HIGH, scaled down by retries (SC1)', () => {
  it('converged on attempt 1 ⇒ ~1.0 (the ceiling)', () => {
    const q = scoreBuildQuality(result({ converged: true, retries: 0 }))!;
    expect(q).toBeGreaterThanOrEqual(BUILD_QUALITY.convergedFloor);
    expect(q).toBeCloseTo(BUILD_QUALITY.convergedCeil, 5);
    expect(q).toBeLessThanOrEqual(1);
  });

  it('converged after retries ⇒ still HIGH but strictly lower than converged-fast', () => {
    const fast = scoreBuildQuality(result({ converged: true, retries: 0 }))!;
    const slow = scoreBuildQuality(result({ converged: true, retries: 3 }))!;
    expect(slow).toBeLessThan(fast);
    // Stays in the HIGH band regardless of retry count.
    expect(slow).toBeGreaterThanOrEqual(BUILD_QUALITY.convergedFloor);
  });

  it('retries monotonically decrease the score within the HIGH band', () => {
    const scores = [0, 1, 2, 3, 5, 10].map(
      (retries) => scoreBuildQuality(result({ converged: true, retries }))!
    );
    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]!).toBeLessThan(scores[i - 1]!);
    }
    // Never drops out of the HIGH band, even at absurd retry counts.
    expect(scores.every((s) => s >= BUILD_QUALITY.convergedFloor)).toBe(true);
  });

  it('negative/garbage retries are floored at 0 (treated as converged-fast)', () => {
    const q = scoreBuildQuality(result({ converged: true, retries: -4 }))!;
    expect(q).toBeCloseTo(BUILD_QUALITY.convergedCeil, 5);
  });
});

describe('scoreBuildQuality — acted-not-converged ⇒ MID (SC1)', () => {
  it('produced files (filesTouched>0) but did not converge ⇒ MID band', () => {
    const q = scoreBuildQuality(result({ converged: false, toolCalls: 1, filesTouched: 3 }))!;
    expect(q).toBeGreaterThanOrEqual(BUILD_QUALITY.midFloor);
    expect(q).toBeLessThanOrEqual(BUILD_QUALITY.midCeil);
  });

  it('multiple tool calls (toolCalls>=2) but no files ⇒ MID band (still acted)', () => {
    const q = scoreBuildQuality(result({ converged: false, toolCalls: 2, filesTouched: 0 }))!;
    expect(q).toBeGreaterThanOrEqual(BUILD_QUALITY.midFloor);
    expect(q).toBeLessThanOrEqual(BUILD_QUALITY.midCeil);
  });

  it('MID sits strictly between LOW and HIGH', () => {
    const mid = scoreBuildQuality(result({ converged: false, toolCalls: 3, filesTouched: 1 }))!;
    const low = scoreBuildQuality(result({ converged: false, toolCalls: 1, filesTouched: 0 }))!;
    const high = scoreBuildQuality(result({ converged: true, retries: 0 }))!;
    expect(mid).toBeGreaterThan(low);
    expect(mid).toBeLessThan(high);
  });
});

describe('scoreBuildQuality — narrated ⇒ LOW (SC1, the llama3.3:70b failure mode)', () => {
  it('no files AND <=1 tool call, not converged ⇒ LOW band', () => {
    const q = scoreBuildQuality(result({ converged: false, toolCalls: 1, filesTouched: 0 }))!;
    expect(q).toBeGreaterThanOrEqual(BUILD_QUALITY.lowFloor);
    expect(q).toBeLessThanOrEqual(BUILD_QUALITY.lowCeil);
  });

  it('zero tool calls, no files ⇒ LOW band', () => {
    const q = scoreBuildQuality(result({ converged: false, toolCalls: 0, filesTouched: 0 }))!;
    expect(q).toBeGreaterThanOrEqual(BUILD_QUALITY.lowFloor);
    expect(q).toBeLessThanOrEqual(BUILD_QUALITY.lowCeil);
  });
});

describe('scoreBuildQuality — act-vs-narrate boundary (SC1)', () => {
  it('toolCalls=1 + no files ⇒ narrated (LOW); toolCalls=2 + no files ⇒ acted (MID)', () => {
    const narrated = scoreBuildQuality(
      result({ converged: false, toolCalls: 1, filesTouched: 0 })
    )!;
    const acted = scoreBuildQuality(result({ converged: false, toolCalls: 2, filesTouched: 0 }))!;
    expect(narrated).toBeLessThanOrEqual(BUILD_QUALITY.lowCeil);
    expect(acted).toBeGreaterThanOrEqual(BUILD_QUALITY.midFloor);
    expect(acted).toBeGreaterThan(narrated);
  });

  it('toolCalls=1 + one file touched ⇒ acted (MID), not narrated', () => {
    const q = scoreBuildQuality(result({ converged: false, toolCalls: 1, filesTouched: 1 }))!;
    expect(q).toBeGreaterThanOrEqual(BUILD_QUALITY.midFloor);
  });
});

describe('scoreBuildQuality — output is always a valid buildQuality multiplier', () => {
  it('every non-error verdict lands in [0, 1]', () => {
    const cases: HarnessFitResult[] = [
      result({ converged: true, retries: 0 }),
      result({ converged: true, retries: 8 }),
      result({ converged: false, toolCalls: 4, filesTouched: 2 }),
      result({ converged: false, toolCalls: 0, filesTouched: 0 }),
    ];
    for (const c of cases) {
      const q = scoreBuildQuality(c)!;
      expect(q).toBeGreaterThanOrEqual(0);
      expect(q).toBeLessThanOrEqual(1);
    }
  });
});
