import { describe, it, expect } from 'vitest';
import { estimateCompressionValue } from './matched-comparison';
import { DEFAULT_MDL_CONFIG, type InclusionEvent, type MdlConfig, type RunOutcome } from './types';

const config: MdlConfig = {
  ...DEFAULT_MDL_CONFIG,
  minPresentRuns: 2,
  minAbsentRuns: 2,
  minPerCell: 2,
};

/** Entry `hv` present in runs p1..p3; absent in a1..a3. */
const inclusions: InclusionEvent[] = [
  { entryId: 'hv', runId: 'p1', tokensShipped: 50 },
  { entryId: 'hv', runId: 'p2', tokensShipped: 50 },
  { entryId: 'hv', runId: 'p3', tokensShipped: 50 },
];

describe('estimateCompressionValue', () => {
  it('measures a positive cost reduction when present runs cost less (same stratum)', () => {
    const outcomes: RunOutcome[] = [
      { runId: 'p1', stratum: 'feature', cost: 100 },
      { runId: 'p2', stratum: 'feature', cost: 120 },
      { runId: 'p3', stratum: 'feature', cost: 110 },
      { runId: 'a1', stratum: 'feature', cost: 300 },
      { runId: 'a2', stratum: 'feature', cost: 320 },
      { runId: 'a3', stratum: 'feature', cost: 310 },
    ];
    const result = estimateCompressionValue('hv', inclusions, outcomes, config);
    expect(result.sufficient).toBe(true);
    expect(result.matchedStrata).toBe(1);
    // absent mean 310, present mean 110 -> ~200 tokens/run avoided.
    expect(result.value).toBeCloseTo(200, 5);
    expect(result.stderr).not.toBeNull();
    expect(result.presentRuns).toBe(3);
    expect(result.absentRuns).toBe(3);
  });

  it('reports insufficient evidence when a cell is under-populated (never fabricates a value)', () => {
    const outcomes: RunOutcome[] = [
      { runId: 'p1', stratum: 'feature', cost: 100 },
      // only one present run in the stratum -> below minPerCell=2
      { runId: 'a1', stratum: 'feature', cost: 300 },
      { runId: 'a2', stratum: 'feature', cost: 320 },
    ];
    const result = estimateCompressionValue('hv', inclusions, outcomes, config);
    expect(result.sufficient).toBe(false);
    expect(result.value).toBeNull();
    expect(result.stderr).toBeNull();
    expect(result.reason).toMatch(/insufficient/i);
  });

  it('does not let a cross-stratum confound leak into the estimate', () => {
    // Present runs live in an EASY stratum (low cost); absent runs in a HARD stratum.
    // With no matched stratum (each stratum has only present OR only absent), the
    // estimate must be insufficient rather than reporting a spurious value.
    const outcomes: RunOutcome[] = [
      { runId: 'p1', stratum: 'easy', cost: 100 },
      { runId: 'p2', stratum: 'easy', cost: 110 },
      { runId: 'p3', stratum: 'easy', cost: 120 },
      { runId: 'a1', stratum: 'hard', cost: 300 },
      { runId: 'a2', stratum: 'hard', cost: 320 },
      { runId: 'a3', stratum: 'hard', cost: 310 },
    ];
    const result = estimateCompressionValue('hv', inclusions, outcomes, config);
    expect(result.matchedStrata).toBe(0);
    expect(result.sufficient).toBe(false);
    expect(result.value).toBeNull();
  });

  it('returns insufficient for an entry with no outcomes at all', () => {
    const result = estimateCompressionValue('hv', inclusions, [], config);
    expect(result.sufficient).toBe(false);
    expect(result.value).toBeNull();
  });
});
