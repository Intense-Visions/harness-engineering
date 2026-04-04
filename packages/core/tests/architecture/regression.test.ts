import { describe, it, expect } from 'vitest';
import {
  weightedLinearRegression,
  applyRecencyWeights,
  projectValue,
  weeksUntilThreshold,
  classifyConfidence,
} from '../../src/architecture/regression';
import type { DataPoint, RegressionFit } from '../../src/architecture/regression';

describe('weightedLinearRegression', () => {
  it('fits a perfect linear dataset (y = 2x + 1)', () => {
    const points: DataPoint[] = [
      { t: 0, value: 1, weight: 1 },
      { t: 1, value: 3, weight: 1 },
      { t: 2, value: 5, weight: 1 },
      { t: 3, value: 7, weight: 1 },
      { t: 4, value: 9, weight: 1 },
    ];
    const fit = weightedLinearRegression(points);
    expect(fit.slope).toBeCloseTo(2, 10);
    expect(fit.intercept).toBeCloseTo(1, 10);
    expect(fit.rSquared).toBeCloseTo(1.0, 10);
    expect(fit.dataPoints).toBe(5);
  });

  it('handles noisy data with R-squared < 1', () => {
    const points: DataPoint[] = [
      { t: 0, value: 1, weight: 1 },
      { t: 1, value: 4, weight: 1 },
      { t: 2, value: 3, weight: 1 },
      { t: 3, value: 8, weight: 1 },
      { t: 4, value: 7, weight: 1 },
    ];
    const fit = weightedLinearRegression(points);
    expect(fit.slope).toBeGreaterThan(0);
    expect(fit.rSquared).toBeGreaterThan(0);
    expect(fit.rSquared).toBeLessThan(1);
    expect(fit.dataPoints).toBe(5);
  });

  it('respects weights -- heavier recent points pull slope', () => {
    // Dataset: starts flat at ~5, then jumps to ~10
    const equalWeight: DataPoint[] = [
      { t: 0, value: 5, weight: 1 },
      { t: 1, value: 5, weight: 1 },
      { t: 2, value: 5, weight: 1 },
      { t: 3, value: 10, weight: 1 },
      { t: 4, value: 10, weight: 1 },
    ];
    const recentHeavy: DataPoint[] = [
      { t: 0, value: 5, weight: 0.1 },
      { t: 1, value: 5, weight: 0.1 },
      { t: 2, value: 5, weight: 0.5 },
      { t: 3, value: 10, weight: 1 },
      { t: 4, value: 10, weight: 1 },
    ];
    const fitEqual = weightedLinearRegression(equalWeight);
    const fitRecent = weightedLinearRegression(recentHeavy);
    // With recent-heavy weights, the slope should be steeper (recent high values pull the line up)
    expect(fitRecent.slope).toBeGreaterThan(fitEqual.slope);
  });

  it('throws with fewer than 2 data points', () => {
    expect(() => weightedLinearRegression([{ t: 0, value: 1, weight: 1 }])).toThrow(
      'at least 2 data points'
    );
    expect(() => weightedLinearRegression([])).toThrow('at least 2 data points');
  });

  it('handles constant values (zero slope)', () => {
    const points: DataPoint[] = [
      { t: 0, value: 5, weight: 1 },
      { t: 1, value: 5, weight: 1 },
      { t: 2, value: 5, weight: 1 },
    ];
    const fit = weightedLinearRegression(points);
    expect(fit.slope).toBeCloseTo(0, 10);
    expect(fit.intercept).toBeCloseTo(5, 10);
    // R-squared is 1 when there is zero variance (perfect fit to constant)
    expect(fit.rSquared).toBe(1);
  });

  it('works with exactly 2 data points', () => {
    const points: DataPoint[] = [
      { t: 0, value: 0, weight: 1 },
      { t: 1, value: 3, weight: 1 },
    ];
    const fit = weightedLinearRegression(points);
    expect(fit.slope).toBeCloseTo(3, 10);
    expect(fit.intercept).toBeCloseTo(0, 10);
    expect(fit.rSquared).toBeCloseTo(1.0, 10);
    expect(fit.dataPoints).toBe(2);
  });
});

describe('applyRecencyWeights', () => {
  it('assigns weight 1.0 to newest, decays backward', () => {
    const values = [
      { t: 0, value: 10 },
      { t: 1, value: 20 },
      { t: 2, value: 30 },
      { t: 3, value: 40 },
      { t: 4, value: 50 },
    ];
    const weighted = applyRecencyWeights(values, 0.85);

    // Newest (index 4) should have weight 1.0 (0.85^0)
    expect(weighted[4].weight).toBeCloseTo(1.0, 10);
    // Second newest (index 3): 0.85^1
    expect(weighted[3].weight).toBeCloseTo(0.85, 10);
    // Oldest (index 0): 0.85^4
    expect(weighted[0].weight).toBeCloseTo(Math.pow(0.85, 4), 10);
  });

  it('preserves t and value fields', () => {
    const values = [
      { t: 0, value: 10 },
      { t: 1, value: 20 },
    ];
    const weighted = applyRecencyWeights(values);
    expect(weighted[0].t).toBe(0);
    expect(weighted[0].value).toBe(10);
    expect(weighted[1].t).toBe(1);
    expect(weighted[1].value).toBe(20);
  });

  it('uses default decay of 0.85', () => {
    const values = [
      { t: 0, value: 1 },
      { t: 1, value: 2 },
    ];
    const weighted = applyRecencyWeights(values);
    expect(weighted[0].weight).toBeCloseTo(0.85, 10);
    expect(weighted[1].weight).toBeCloseTo(1.0, 10);
  });

  it('handles single value', () => {
    const values = [{ t: 0, value: 42 }];
    const weighted = applyRecencyWeights(values);
    expect(weighted[0].weight).toBeCloseTo(1.0, 10);
  });

  it('handles empty array', () => {
    const weighted = applyRecencyWeights([]);
    expect(weighted).toEqual([]);
  });
});

describe('projectValue', () => {
  it('projects correctly for slope=2, intercept=1 at t=10', () => {
    const fit: RegressionFit = { slope: 2, intercept: 1, rSquared: 1, dataPoints: 5 };
    expect(projectValue(fit, 10)).toBe(21);
  });

  it('projects correctly at t=0', () => {
    const fit: RegressionFit = { slope: 3, intercept: 7, rSquared: 0.9, dataPoints: 4 };
    expect(projectValue(fit, 0)).toBe(7);
  });

  it('handles negative slope', () => {
    const fit: RegressionFit = { slope: -1.5, intercept: 20, rSquared: 0.8, dataPoints: 6 };
    expect(projectValue(fit, 4)).toBeCloseTo(14, 10);
  });
});

describe('weeksUntilThreshold', () => {
  it('returns positive weeks for increasing trend approaching threshold', () => {
    const fit: RegressionFit = { slope: 2, intercept: 0, rSquared: 0.9, dataPoints: 5 };
    // Current at t=5: value = 10. Threshold = 20. Need 5 more weeks.
    const weeks = weeksUntilThreshold(fit, 5, 20);
    expect(weeks).toBe(5);
  });

  it('returns null for zero slope', () => {
    const fit: RegressionFit = { slope: 0, intercept: 5, rSquared: 0.5, dataPoints: 3 };
    expect(weeksUntilThreshold(fit, 3, 10)).toBeNull();
  });

  it('returns null for negative slope (improving)', () => {
    const fit: RegressionFit = { slope: -1, intercept: 20, rSquared: 0.7, dataPoints: 5 };
    expect(weeksUntilThreshold(fit, 5, 30)).toBeNull();
  });

  it('returns null when already above threshold', () => {
    const fit: RegressionFit = { slope: 2, intercept: 0, rSquared: 0.9, dataPoints: 5 };
    // Current at t=15: value = 30. Threshold = 20. Already exceeded.
    expect(weeksUntilThreshold(fit, 15, 20)).toBeNull();
  });

  it('rounds up to next whole week', () => {
    const fit: RegressionFit = { slope: 3, intercept: 0, rSquared: 0.8, dataPoints: 4 };
    // Current at t=0: value = 0. Threshold = 10. Weeks = 10/3 = 3.33 -> ceil to 4
    expect(weeksUntilThreshold(fit, 0, 10)).toBe(4);
  });
});

describe('classifyConfidence', () => {
  it('returns high for R-squared >= 0.7 and 5+ points', () => {
    expect(classifyConfidence(0.7, 5)).toBe('high');
    expect(classifyConfidence(0.95, 10)).toBe('high');
  });

  it('returns medium for R-squared >= 0.4 and 3+ points', () => {
    expect(classifyConfidence(0.4, 3)).toBe('medium');
    expect(classifyConfidence(0.6, 4)).toBe('medium');
  });

  it('returns low for insufficient R-squared', () => {
    expect(classifyConfidence(0.3, 10)).toBe('low');
    expect(classifyConfidence(0.1, 5)).toBe('low');
  });

  it('returns low for insufficient data points despite good R-squared', () => {
    expect(classifyConfidence(0.9, 2)).toBe('low');
    expect(classifyConfidence(0.7, 4)).toBe('medium'); // not high: needs 5+
  });

  it('returns medium not high for R-squared >= 0.7 with only 3-4 points', () => {
    expect(classifyConfidence(0.8, 3)).toBe('medium');
    expect(classifyConfidence(0.7, 4)).toBe('medium');
  });

  it('returns low for R-squared >= 0.4 with only 2 points', () => {
    expect(classifyConfidence(0.5, 2)).toBe('low');
  });

  it('handles boundary values exactly', () => {
    expect(classifyConfidence(0.7, 5)).toBe('high'); // exact boundary
    expect(classifyConfidence(0.4, 3)).toBe('medium'); // exact boundary
    expect(classifyConfidence(0.39, 3)).toBe('low'); // just below
    expect(classifyConfidence(0.69, 5)).toBe('medium'); // just below high
  });
});

describe('recency weighting shifts regression toward recent data', () => {
  it('produces steeper slope when recent data trends upward', () => {
    // Dataset: steady at 5 for first 3 points, then jumps to 10 for last 2
    const values = [
      { t: 0, value: 5 },
      { t: 1, value: 5 },
      { t: 2, value: 5 },
      { t: 3, value: 10 },
      { t: 4, value: 10 },
    ];

    // Equal weights
    const equalWeighted = values.map((v) => ({ ...v, weight: 1 }));
    const fitEqual = weightedLinearRegression(equalWeighted);

    // Recency weights
    const recencyWeighted = applyRecencyWeights(values, 0.85);
    const fitRecency = weightedLinearRegression(recencyWeighted);

    // Recency-weighted fit should have a steeper slope
    // because the high recent values are weighted more
    expect(fitRecency.slope).toBeGreaterThan(fitEqual.slope);
  });
});
