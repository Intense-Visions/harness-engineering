# Plan: Predictive Architecture Failure -- Phase 1: Regression Math & Types

**Date:** 2026-04-04
**Spec:** docs/changes/predictive-architecture-failure/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Create the pure regression math module and prediction type definitions (with Zod schemas) that form the computational foundation for the Predictive Architecture Failure feature.

## Observable Truths (Acceptance Criteria)

1. `packages/core/src/architecture/prediction-types.ts` exists and exports Zod schemas and TypeScript types for: `ConfidenceTierSchema`, `RegressionResultSchema`, `CategoryForecastSchema`, `SpecImpactEstimateSchema`, `AdjustedForecastSchema`, `PredictionResultSchema`, `PredictionWarningSchema`, and their inferred types.
2. `packages/core/src/architecture/regression.ts` exists and exports: `DataPoint`, `RegressionFit`, `weightedLinearRegression`, `applyRecencyWeights`, `projectValue`, `weeksUntilThreshold`, `classifyConfidence`.
3. When `weightedLinearRegression` is called with a known linear dataset (y = 2x + 1, equal weights), the system shall return slope approximately 2, intercept approximately 1, and R-squared approximately 1.0.
4. When `applyRecencyWeights` is called with 5 values and decay=0.85, the system shall assign weight 1.0 to the newest and 0.85^4 (~0.522) to the oldest.
5. When `projectValue` is called with fit (slope=2, intercept=1) at t=10, the system shall return 21.
6. When `weeksUntilThreshold` is called with a positive slope and threshold above current, the system shall return a positive number. When slope is zero or negative, the system shall return null.
7. `classifyConfidence` returns `high` for R-squared >= 0.7 with 5+ data points, `medium` for R-squared >= 0.4 with 3+ points, `low` otherwise.
8. Recency weighting demonstrably shifts regression toward recent data -- a dataset with an upward shift in recent points produces a steeper slope with recency weights vs. equal weights.
9. All prediction type Zod schemas validate correct data and reject malformed data.
10. Barrel exports in `packages/core/src/architecture/index.ts` include all new schemas, types, and functions.
11. `npx vitest run packages/core/tests/architecture/prediction-types.test.ts` passes.
12. `npx vitest run packages/core/tests/architecture/regression.test.ts` passes.
13. `harness validate` passes.

## File Map

```
CREATE packages/core/src/architecture/prediction-types.ts
CREATE packages/core/src/architecture/regression.ts
CREATE packages/core/tests/architecture/prediction-types.test.ts
CREATE packages/core/tests/architecture/regression.test.ts
MODIFY packages/core/src/architecture/index.ts (add barrel exports)
```

## Tasks

### Task 1: Define prediction types with Zod schemas

**Depends on:** none
**Files:** `packages/core/src/architecture/prediction-types.ts`

1. Create `packages/core/src/architecture/prediction-types.ts` with the following content:

```typescript
import { z } from 'zod';
import { ArchMetricCategorySchema } from './types';
import type { ArchMetricCategory } from './types';

// --- Confidence Tier ---

export const ConfidenceTierSchema = z.enum(['high', 'medium', 'low']);
export type ConfidenceTier = z.infer<typeof ConfidenceTierSchema>;

// --- Regression Result ---

export const RegressionResultSchema = z.object({
  slope: z.number(),
  intercept: z.number(),
  rSquared: z.number().min(0).max(1),
  dataPoints: z.number().int().min(0),
});

export type RegressionResult = z.infer<typeof RegressionResultSchema>;

// --- Direction ---

export const DirectionSchema = z.enum(['improving', 'stable', 'declining']);
export type Direction = z.infer<typeof DirectionSchema>;

// --- Category Forecast ---

export const CategoryForecastSchema = z.object({
  category: ArchMetricCategorySchema,
  current: z.number(),
  threshold: z.number(),
  projectedValue4w: z.number(),
  projectedValue8w: z.number(),
  projectedValue12w: z.number(),
  thresholdCrossingWeeks: z.number().nullable(),
  confidence: ConfidenceTierSchema,
  regression: RegressionResultSchema,
  direction: DirectionSchema,
});

export type CategoryForecast = z.infer<typeof CategoryForecastSchema>;

// --- Spec Impact Estimate ---

export const SpecImpactSignalsSchema = z.object({
  newFileCount: z.number().int().min(0),
  affectedLayers: z.array(z.string()),
  newDependencies: z.number().int().min(0),
  phaseCount: z.number().int().min(0),
});

export const SpecImpactEstimateSchema = z.object({
  specPath: z.string(),
  featureName: z.string(),
  signals: SpecImpactSignalsSchema,
  deltas: z.record(ArchMetricCategorySchema, z.number()).optional(),
});

export type SpecImpactEstimate = z.infer<typeof SpecImpactEstimateSchema>;

// --- Adjusted Forecast ---

export const ContributingFeatureSchema = z.object({
  name: z.string(),
  specPath: z.string(),
  delta: z.number(),
});

export const AdjustedForecastSchema = z.object({
  baseline: CategoryForecastSchema,
  adjusted: CategoryForecastSchema,
  contributingFeatures: z.array(ContributingFeatureSchema),
});

export type AdjustedForecast = z.infer<typeof AdjustedForecastSchema>;

// --- Prediction Warning ---

export const PredictionWarningSchema = z.object({
  severity: z.enum(['critical', 'warning', 'info']),
  category: ArchMetricCategorySchema,
  message: z.string(),
  weeksUntil: z.number(),
  confidence: ConfidenceTierSchema,
  contributingFeatures: z.array(z.string()),
});

export type PredictionWarning = z.infer<typeof PredictionWarningSchema>;

// --- Stability Forecast ---

export const StabilityForecastSchema = z.object({
  current: z.number(),
  projected4w: z.number(),
  projected8w: z.number(),
  projected12w: z.number(),
  confidence: ConfidenceTierSchema,
  direction: DirectionSchema,
});

export type StabilityForecast = z.infer<typeof StabilityForecastSchema>;

// --- Prediction Result ---

export const PredictionResultSchema = z.object({
  generatedAt: z.string(),
  snapshotsUsed: z.number().int().min(0),
  timelineRange: z.object({
    from: z.string(),
    to: z.string(),
  }),
  stabilityForecast: StabilityForecastSchema,
  categories: z.record(ArchMetricCategorySchema, AdjustedForecastSchema),
  warnings: z.array(PredictionWarningSchema),
});

export type PredictionResult = z.infer<typeof PredictionResultSchema>;

// --- Prediction Options ---

export const PredictionOptionsSchema = z.object({
  horizon: z.number().int().min(1).default(12),
  includeRoadmap: z.boolean().default(true),
  categories: z.array(ArchMetricCategorySchema).optional(),
  thresholds: z.record(ArchMetricCategorySchema, z.number()).optional(),
});

export type PredictionOptions = z.infer<typeof PredictionOptionsSchema>;
```

2. Verify the file compiles:
   ```
   cd packages/core && npx tsc --noEmit src/architecture/prediction-types.ts --skipLibCheck 2>&1 || true
   ```
3. Run: `harness validate`
4. Commit: `feat(architecture): add prediction type definitions with Zod schemas`

---

### Task 2: Write prediction types test suite

**Depends on:** Task 1
**Files:** `packages/core/tests/architecture/prediction-types.test.ts`

1. Create `packages/core/tests/architecture/prediction-types.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  ConfidenceTierSchema,
  RegressionResultSchema,
  CategoryForecastSchema,
  SpecImpactEstimateSchema,
  AdjustedForecastSchema,
  PredictionWarningSchema,
  PredictionResultSchema,
  PredictionOptionsSchema,
  StabilityForecastSchema,
} from '../../src/architecture/prediction-types';

describe('ConfidenceTierSchema', () => {
  it('accepts valid tiers', () => {
    for (const tier of ['high', 'medium', 'low']) {
      expect(ConfidenceTierSchema.safeParse(tier).success).toBe(true);
    }
  });

  it('rejects invalid tier', () => {
    expect(ConfidenceTierSchema.safeParse('extreme').success).toBe(false);
  });
});

describe('RegressionResultSchema', () => {
  it('validates a complete regression result', () => {
    const result = RegressionResultSchema.safeParse({
      slope: 2.5,
      intercept: 1.0,
      rSquared: 0.95,
      dataPoints: 8,
    });
    expect(result.success).toBe(true);
  });

  it('rejects rSquared > 1', () => {
    const result = RegressionResultSchema.safeParse({
      slope: 1,
      intercept: 0,
      rSquared: 1.5,
      dataPoints: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects rSquared < 0', () => {
    const result = RegressionResultSchema.safeParse({
      slope: 1,
      intercept: 0,
      rSquared: -0.1,
      dataPoints: 5,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer dataPoints', () => {
    const result = RegressionResultSchema.safeParse({
      slope: 1,
      intercept: 0,
      rSquared: 0.5,
      dataPoints: 3.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('CategoryForecastSchema', () => {
  const validForecast = {
    category: 'complexity',
    current: 47,
    threshold: 100,
    projectedValue4w: 55,
    projectedValue8w: 63,
    projectedValue12w: 71,
    thresholdCrossingWeeks: 14,
    confidence: 'high',
    regression: { slope: 2.0, intercept: 45, rSquared: 0.85, dataPoints: 8 },
    direction: 'declining',
  };

  it('validates a complete forecast', () => {
    expect(CategoryForecastSchema.safeParse(validForecast).success).toBe(true);
  });

  it('accepts null thresholdCrossingWeeks', () => {
    const result = CategoryForecastSchema.safeParse({
      ...validForecast,
      thresholdCrossingWeeks: null,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid category', () => {
    const result = CategoryForecastSchema.safeParse({
      ...validForecast,
      category: 'invalid',
    });
    expect(result.success).toBe(false);
  });
});

describe('SpecImpactEstimateSchema', () => {
  it('validates a complete impact estimate', () => {
    const result = SpecImpactEstimateSchema.safeParse({
      specPath: 'docs/changes/feature/proposal.md',
      featureName: 'Test Feature',
      signals: {
        newFileCount: 5,
        affectedLayers: ['services', 'api'],
        newDependencies: 2,
        phaseCount: 3,
      },
      deltas: { complexity: 4.5, coupling: 0.2 },
    });
    expect(result.success).toBe(true);
  });

  it('accepts estimate without deltas', () => {
    const result = SpecImpactEstimateSchema.safeParse({
      specPath: 'docs/changes/feature/proposal.md',
      featureName: 'Test Feature',
      signals: {
        newFileCount: 0,
        affectedLayers: [],
        newDependencies: 0,
        phaseCount: 1,
      },
    });
    expect(result.success).toBe(true);
  });
});

describe('PredictionWarningSchema', () => {
  it('validates a complete warning', () => {
    const result = PredictionWarningSchema.safeParse({
      severity: 'critical',
      category: 'complexity',
      message: 'complexity projected to exceed threshold (~4w, high confidence)',
      weeksUntil: 4,
      confidence: 'high',
      contributingFeatures: ['Feature A', 'Feature B'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid severity', () => {
    const result = PredictionWarningSchema.safeParse({
      severity: 'urgent',
      category: 'complexity',
      message: 'test',
      weeksUntil: 4,
      confidence: 'high',
      contributingFeatures: [],
    });
    expect(result.success).toBe(false);
  });
});

describe('PredictionOptionsSchema', () => {
  it('applies defaults', () => {
    const result = PredictionOptionsSchema.parse({});
    expect(result.horizon).toBe(12);
    expect(result.includeRoadmap).toBe(true);
  });

  it('accepts overrides', () => {
    const result = PredictionOptionsSchema.parse({
      horizon: 24,
      includeRoadmap: false,
      categories: ['complexity', 'coupling'],
    });
    expect(result.horizon).toBe(24);
    expect(result.includeRoadmap).toBe(false);
    expect(result.categories).toEqual(['complexity', 'coupling']);
  });

  it('rejects horizon < 1', () => {
    const result = PredictionOptionsSchema.safeParse({ horizon: 0 });
    expect(result.success).toBe(false);
  });
});

describe('StabilityForecastSchema', () => {
  it('validates a complete stability forecast', () => {
    const result = StabilityForecastSchema.safeParse({
      current: 82,
      projected4w: 78,
      projected8w: 76,
      projected12w: 74,
      confidence: 'medium',
      direction: 'declining',
    });
    expect(result.success).toBe(true);
  });
});

describe('PredictionResultSchema', () => {
  it('validates a minimal prediction result', () => {
    const minimalForecast = {
      category: 'complexity',
      current: 47,
      threshold: 100,
      projectedValue4w: 55,
      projectedValue8w: 63,
      projectedValue12w: 71,
      thresholdCrossingWeeks: null,
      confidence: 'medium',
      regression: { slope: 2.0, intercept: 45, rSquared: 0.6, dataPoints: 5 },
      direction: 'declining',
    };

    const result = PredictionResultSchema.safeParse({
      generatedAt: '2026-04-04T12:00:00Z',
      snapshotsUsed: 5,
      timelineRange: { from: '2026-01-01', to: '2026-04-04' },
      stabilityForecast: {
        current: 82,
        projected4w: 78,
        projected8w: 76,
        projected12w: 74,
        confidence: 'medium',
        direction: 'declining',
      },
      categories: {
        complexity: {
          baseline: minimalForecast,
          adjusted: minimalForecast,
          contributingFeatures: [],
        },
      },
      warnings: [],
    });
    expect(result.success).toBe(true);
  });
});
```

2. Run test: `npx vitest run packages/core/tests/architecture/prediction-types.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(architecture): add prediction types schema validation tests`

---

### Task 3: Implement regression math module

**Depends on:** none (standalone pure math, no cross-file deps)
**Files:** `packages/core/src/architecture/regression.ts`

1. Create `packages/core/src/architecture/regression.ts`:

```typescript
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

/**
 * Weighted least squares linear regression.
 * Fits y = slope * t + intercept, minimizing weighted sum of squared residuals.
 *
 * @param points - Array of data points with time, value, and weight
 * @returns RegressionFit with slope, intercept, R-squared, and data point count
 * @throws Error if fewer than 2 data points provided
 */
export function weightedLinearRegression(points: DataPoint[]): RegressionFit {
  if (points.length < 2) {
    throw new Error(`Regression requires at least 2 data points, got ${points.length}`);
  }

  const n = points.length;

  // Weighted sums
  let sumW = 0;
  let sumWt = 0;
  let sumWv = 0;
  let sumWtt = 0;
  let sumWtv = 0;
  let sumWvv = 0;

  for (const p of points) {
    const w = p.weight;
    sumW += w;
    sumWt += w * p.t;
    sumWv += w * p.value;
    sumWtt += w * p.t * p.t;
    sumWtv += w * p.t * p.value;
    sumWvv += w * p.value * p.value;
  }

  // Weighted means
  const meanT = sumWt / sumW;
  const meanV = sumWv / sumW;

  // Slope and intercept via weighted least squares
  const denominator = sumWtt - (sumWt * sumWt) / sumW;

  // Guard against zero denominator (all t values identical)
  if (Math.abs(denominator) < 1e-12) {
    return {
      slope: 0,
      intercept: meanV,
      rSquared: 0,
      dataPoints: n,
    };
  }

  const slope = (sumWtv - (sumWt * sumWv) / sumW) / denominator;
  const intercept = meanV - slope * meanT;

  // R-squared: 1 - (weighted SS_res / weighted SS_tot)
  let ssRes = 0;
  let ssTot = 0;
  for (const p of points) {
    const predicted = slope * p.t + intercept;
    ssRes += p.weight * (p.value - predicted) ** 2;
    ssTot += p.weight * (p.value - meanV) ** 2;
  }

  const rSquared = ssTot < 1e-12 ? 1 : Math.max(0, 1 - ssRes / ssTot);

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
```

2. Run: `harness validate`
3. Commit: `feat(architecture): add weighted linear regression math module`

---

### Task 4: Write regression math test suite

**Depends on:** Task 3
**Files:** `packages/core/tests/architecture/regression.test.ts`

1. Create `packages/core/tests/architecture/regression.test.ts`:

```typescript
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
    // With recent-heavy weights, the intercept should be higher (line pulled toward recent high values)
    expect(fitRecent.intercept).toBeGreaterThan(fitEqual.intercept);
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
```

2. Run test: `npx vitest run packages/core/tests/architecture/regression.test.ts`
3. Observe: all tests pass.
4. Run: `harness validate`
5. Commit: `test(architecture): add regression math unit tests with synthetic datasets`

---

### Task 5: Update barrel exports in index.ts

**Depends on:** Task 1, Task 3
**Files:** `packages/core/src/architecture/index.ts`

1. Add the following export blocks to the end of `packages/core/src/architecture/index.ts`:

```typescript
export {
  ConfidenceTierSchema,
  RegressionResultSchema,
  DirectionSchema,
  CategoryForecastSchema,
  SpecImpactSignalsSchema,
  SpecImpactEstimateSchema,
  ContributingFeatureSchema,
  AdjustedForecastSchema,
  PredictionWarningSchema,
  StabilityForecastSchema,
  PredictionResultSchema,
  PredictionOptionsSchema,
} from './prediction-types';

export type {
  ConfidenceTier,
  RegressionResult,
  Direction,
  CategoryForecast,
  SpecImpactEstimate,
  AdjustedForecast,
  PredictionWarning,
  StabilityForecast,
  PredictionResult,
  PredictionOptions,
} from './prediction-types';

export {
  weightedLinearRegression,
  applyRecencyWeights,
  projectValue,
  weeksUntilThreshold,
  classifyConfidence,
} from './regression';

export type { DataPoint, RegressionFit } from './regression';
```

2. Run: `cd packages/core && npx tsc --noEmit`
3. Run full test suite: `npx vitest run packages/core/tests/architecture/`
4. Observe: all tests pass (both new and existing).
5. Run: `harness validate`
6. Commit: `feat(architecture): add prediction types and regression to barrel exports`

---

## Traceability

| Observable Truth                                 | Delivered By                                              |
| ------------------------------------------------ | --------------------------------------------------------- |
| 1. prediction-types.ts exists with schemas       | Task 1                                                    |
| 2. regression.ts exists with functions           | Task 3                                                    |
| 3. Perfect linear dataset fit                    | Task 4 (test: "fits a perfect linear dataset")            |
| 4. Recency weight assignment                     | Task 4 (test: "assigns weight 1.0 to newest")             |
| 5. projectValue(slope=2, intercept=1, t=10) = 21 | Task 4 (test: "projects correctly for slope=2")           |
| 6. weeksUntilThreshold positive/null             | Task 4 (tests: "returns positive weeks" + "returns null") |
| 7. classifyConfidence tiers                      | Task 4 (tests: "returns high/medium/low")                 |
| 8. Recency shifts slope                          | Task 4 (test: "produces steeper slope")                   |
| 9. Zod schema validation                         | Task 2                                                    |
| 10. Barrel exports                               | Task 5                                                    |
| 11. prediction-types tests pass                  | Task 2                                                    |
| 12. regression tests pass                        | Task 4                                                    |
| 13. harness validate passes                      | All tasks                                                 |
