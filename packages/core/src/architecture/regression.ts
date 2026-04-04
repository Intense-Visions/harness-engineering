/**
 * Pure math module for weighted linear regression.
 * No harness type dependencies — independently testable with synthetic data.
 */

export interface DataPoint {
  t: number; // time (weeks from first snapshot)
  value: number; // metric value
  weight: number; // recency weight
}

export interface RegressionFit {
  slope: number;
  intercept: number;
  rSquared: number;
  dataPoints: number;
}

interface WeightedSums {
  sumW: number;
  sumWt: number;
  sumWv: number;
  sumWtt: number;
  sumWtv: number;
}

function computeWeightedSums(points: DataPoint[]): WeightedSums {
  let sumW = 0,
    sumWt = 0,
    sumWv = 0,
    sumWtt = 0,
    sumWtv = 0;
  for (const p of points) {
    const w = p.weight;
    sumW += w;
    sumWt += w * p.t;
    sumWv += w * p.value;
    sumWtt += w * p.t * p.t;
    sumWtv += w * p.t * p.value;
  }
  return { sumW, sumWt, sumWv, sumWtt, sumWtv };
}

function computeRSquared(
  points: DataPoint[],
  slope: number,
  intercept: number,
  meanV: number
): number {
  let ssRes = 0,
    ssTot = 0;
  for (const p of points) {
    const predicted = slope * p.t + intercept;
    ssRes += p.weight * (p.value - predicted) ** 2;
    ssTot += p.weight * (p.value - meanV) ** 2;
  }
  return ssTot < 1e-12 ? 1 : Math.max(0, 1 - ssRes / ssTot);
}

/**
 * Weighted least squares linear regression.
 * Fits y = slope * t + intercept, minimizing weighted sum of squared residuals.
 */
export function weightedLinearRegression(points: DataPoint[]): RegressionFit {
  if (points.length < 2) {
    throw new Error(`Regression requires at least 2 data points, got ${points.length}`);
  }

  const n = points.length;
  const { sumW, sumWt, sumWv, sumWtt, sumWtv } = computeWeightedSums(points);
  const meanT = sumWt / sumW;
  const meanV = sumWv / sumW;

  const denominator = sumWtt - (sumWt * sumWt) / sumW;
  if (Math.abs(denominator) < 1e-12) {
    return { slope: 0, intercept: meanV, rSquared: 0, dataPoints: n };
  }

  const slope = (sumWtv - (sumWt * sumWv) / sumW) / denominator;
  const intercept = meanV - slope * meanT;
  const rSquared = computeRSquared(points, slope, intercept, meanV);

  return { slope, intercept, rSquared, dataPoints: n };
}

/**
 * Assign recency weights to a time-ordered series of values.
 * Newest value gets weight 1.0, each older value is multiplied by decay.
 *
 * @param values - Time-ordered array of { t, value } (oldest first)
 * @param decay - Weight decay factor per step (default: 0.85)
 * @returns DataPoint array with recency weights assigned
 */
export function applyRecencyWeights(
  values: Array<{ t: number; value: number }>,
  decay: number = 0.85
): DataPoint[] {
  const n = values.length;
  return values.map((v, i) => ({
    t: v.t,
    value: v.value,
    weight: Math.pow(decay, n - 1 - i),
  }));
}

/**
 * Project a value at future time t using a regression fit.
 *
 * @param fit - The regression fit (slope + intercept)
 * @param t - The time to project to
 * @returns Projected value
 */
export function projectValue(fit: RegressionFit, t: number): number {
  return fit.slope * t + fit.intercept;
}

/**
 * Calculate weeks until projected value crosses a threshold.
 *
 * @param fit - The regression fit
 * @param currentT - Current time point (weeks from first snapshot)
 * @param threshold - The threshold value to cross
 * @returns Weeks until crossing, or null if slope <= 0 (improving/stable) or already crossed
 */
export function weeksUntilThreshold(
  fit: RegressionFit,
  currentT: number,
  threshold: number
): number | null {
  // If slope is zero or negative (improving/stable), threshold will never be crossed
  if (fit.slope <= 0) {
    return null;
  }

  const currentProjected = projectValue(fit, currentT);

  // Already above threshold
  if (currentProjected >= threshold) {
    return null;
  }

  // weeks = (threshold - currentProjected) / slope
  const weeks = (threshold - currentProjected) / fit.slope;
  return Math.ceil(weeks);
}

/**
 * Classify confidence based on R-squared and data point count.
 *
 * High:   R-squared >= 0.7 AND 5+ data points
 * Medium: R-squared >= 0.4 AND 3+ data points
 * Low:    anything else
 *
 * @param rSquared - Goodness of fit (0-1)
 * @param dataPoints - Number of data points used
 * @returns Confidence tier
 */
export function classifyConfidence(
  rSquared: number,
  dataPoints: number
): 'high' | 'medium' | 'low' {
  if (rSquared >= 0.7 && dataPoints >= 5) return 'high';
  if (rSquared >= 0.4 && dataPoints >= 3) return 'medium';
  return 'low';
}
