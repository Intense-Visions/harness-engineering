import { describe, it, expect } from 'vitest';
import {
  weightedScore,
  aggregateAtK,
  regressionFloor,
  deriveRegressionVerdict,
} from '../../src/skill-regression/scorer.js';
import type {
  CriterionJudgment,
  GoldenBaseline,
  RubricCriterion,
} from '../../src/skill-regression/types.js';

const RUBRIC: RubricCriterion[] = [
  { id: 'a', criterion: 'A', weight: 2 },
  { id: 'b', criterion: 'B' }, // weight defaults to 1
  { id: 'c', criterion: 'C' },
];

function judgments(met: Record<string, boolean>): CriterionJudgment[] {
  return Object.entries(met).map(([id, m]) => ({ id, met: m, note: '' }));
}

describe('weightedScore', () => {
  it('is the weighted fraction of criteria met', () => {
    // a(2) met, b(1) met, c(1) not → 3/4 = 0.75
    expect(weightedScore(RUBRIC, judgments({ a: true, b: true, c: false }))).toBeCloseTo(0.75);
  });

  it('scores 1 when all criteria are met', () => {
    expect(weightedScore(RUBRIC, judgments({ a: true, b: true, c: true }))).toBe(1);
  });

  it('counts a criterion with no matching ruling as not-met (no silent inflation)', () => {
    // only a(2) ruled met; b and c absent → 2/4 = 0.5
    expect(weightedScore(RUBRIC, judgments({ a: true }))).toBeCloseTo(0.5);
  });

  it('scores 0 for an empty rubric', () => {
    expect(weightedScore([], judgments({ a: true }))).toBe(0);
  });
});

describe('aggregateAtK', () => {
  it('is the mean across samples', () => {
    expect(aggregateAtK([1, 0.5, 0])).toBeCloseTo(0.5);
  });
  it('scores 0 for no samples', () => {
    expect(aggregateAtK([])).toBe(0);
  });
});

describe('deriveRegressionVerdict', () => {
  const baseline: GoldenBaseline = { score: 1, k: 1, tolerance: 0.25 };

  it('regression floor is baseline minus tolerance', () => {
    expect(regressionFloor(baseline)).toBeCloseTo(0.75);
  });

  it('STABLE when the score equals the baseline', () => {
    expect(deriveRegressionVerdict(1, baseline).verdict).toBe('STABLE');
  });

  it('STABLE when the score is exactly at the floor', () => {
    // 0.75 is NOT strictly below the floor → still stable.
    expect(deriveRegressionVerdict(0.75, baseline).verdict).toBe('STABLE');
  });

  it('REGRESSED when the score drops strictly below the floor', () => {
    const { verdict, delta } = deriveRegressionVerdict(0.5, baseline);
    expect(verdict).toBe('REGRESSED');
    expect(delta).toBeCloseTo(0.5);
  });
});
