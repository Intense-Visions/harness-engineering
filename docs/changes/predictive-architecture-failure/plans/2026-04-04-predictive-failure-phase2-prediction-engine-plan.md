# Plan: PredictionEngine (Baseline) -- Phase 2 of Predictive Architecture Failure

**Date:** 2026-04-04
**Spec:** docs/changes/predictive-architecture-failure/proposal.md
**Estimated tasks:** 5
**Estimated time:** 20 minutes

## Goal

Implement the `PredictionEngine` class that loads timeline snapshots, runs weighted linear regression per metric category, and produces a complete `PredictionResult` with baseline forecasts and severity-classified warnings.

## Observable Truths (Acceptance Criteria)

1. When `predict()` is called with 5+ snapshots spanning multiple weeks, the system shall return a `PredictionResult` with all 7 `ArchMetricCategory` entries, each containing projected values at 4w, 8w, and 12w horizons.
2. When a category has a positive regression slope trending toward its threshold, the system shall compute `thresholdCrossingWeeks` as a positive integer (weeks from current).
3. When a category is improving (negative slope) or stable (near-zero slope), the system shall return `thresholdCrossingWeeks: null`.
4. If fewer than 3 snapshots exist in the timeline, then the system shall throw an error with message containing "at least 3 snapshots".
5. When a category has zero values across all snapshots, the system shall produce a forecast with `current: 0`, all projections `0`, and `direction: 'stable'`.
6. The system shall generate warnings with severity `critical` for threshold crossings <= 4 weeks with high or medium confidence, `warning` for crossings <= 8 weeks with high or medium confidence, and `info` for crossings <= 12 weeks at any confidence.
7. When the `PredictionEngine` has no `SpecImpactEstimator` (null), the `adjusted` forecast in each `AdjustedForecast` shall equal the `baseline` forecast, and `contributingFeatures` shall be empty.
8. The system shall compute a composite `stabilityForecast` with projected stability scores at 4w, 8w, 12w derived from per-category forecasts.
9. `PredictionResultSchema.parse(result)` shall succeed for all returned results (Zod validation).
10. `npx vitest run tests/architecture/prediction-engine.test.ts` passes with all tests green.

## File Map

```
CREATE packages/core/src/architecture/prediction-engine.ts
CREATE packages/core/tests/architecture/prediction-engine.test.ts
MODIFY packages/core/src/architecture/index.ts (add PredictionEngine export)
```

## Tasks

### Task 1: Create PredictionEngine test suite -- snapshot-to-timeseries conversion and edge cases

**Depends on:** none (Phase 1 types and regression module already exist)
**Files:** `packages/core/tests/architecture/prediction-engine.test.ts`

1. Create test file `packages/core/tests/architecture/prediction-engine.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { PredictionEngine } from '../../src/architecture/prediction-engine';
import { PredictionResultSchema } from '../../src/architecture/prediction-types';
import { DEFAULT_STABILITY_THRESHOLDS } from '../../src/architecture/timeline-types';
import type { TimelineFile, TimelineSnapshot } from '../../src/architecture/timeline-types';
import type { ArchMetricCategory } from '../../src/architecture/types';
import type { TimelineManager } from '../../src/architecture/timeline-manager';

const ALL_CATEGORIES: ArchMetricCategory[] = [
  'circular-deps',
  'layer-violations',
  'complexity',
  'coupling',
  'forbidden-imports',
  'module-size',
  'dependency-depth',
];

/** Build a minimal snapshot with given overrides */
function makeSnapshot(
  weekOffset: number,
  overrides: Partial<Record<ArchMetricCategory, number>> = {},
  baseDate = '2026-01-05T00:00:00.000Z'
): TimelineSnapshot {
  const date = new Date(baseDate);
  date.setDate(date.getDate() + weekOffset * 7);

  const metrics: Record<string, { value: number; violationCount: number }> = {};
  for (const cat of ALL_CATEGORIES) {
    metrics[cat] = { value: overrides[cat] ?? 0, violationCount: 0 };
  }

  return {
    capturedAt: date.toISOString(),
    commitHash: `abc${weekOffset}`,
    stabilityScore: 80,
    metrics: metrics as TimelineSnapshot['metrics'],
  };
}

/** Build a mock TimelineManager that returns the given timeline */
function mockTimelineManager(timeline: TimelineFile): TimelineManager {
  return {
    load: () => timeline,
    save: () => {},
    capture: () => timeline.snapshots[0]!,
    trends: () => ({
      stability: { current: 80, previous: 80, delta: 0, direction: 'stable' as const },
      categories: {} as any,
      snapshotCount: timeline.snapshots.length,
      from: '',
      to: '',
    }),
    computeStabilityScore: (metrics: any, thresholds?: any) => {
      const t = thresholds ?? DEFAULT_STABILITY_THRESHOLDS;
      const scores: number[] = [];
      for (const cat of ALL_CATEGORIES) {
        const val = metrics[cat]?.value ?? 0;
        const thresh = t[cat] ?? 10;
        scores.push(Math.max(0, 1 - val / thresh));
      }
      return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100);
    },
  } as unknown as TimelineManager;
}

describe('PredictionEngine', () => {
  describe('edge cases', () => {
    it('throws when fewer than 3 snapshots', () => {
      const tm = mockTimelineManager({ version: 1, snapshots: [makeSnapshot(0), makeSnapshot(1)] });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      expect(() => engine.predict()).toThrow(/at least 3 snapshots/i);
    });

    it('throws when timeline is empty', () => {
      const tm = mockTimelineManager({ version: 1, snapshots: [] });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      expect(() => engine.predict()).toThrow(/at least 3 snapshots/i);
    });

    it('handles exactly 3 snapshots (minimum viable)', () => {
      const snapshots = [makeSnapshot(0), makeSnapshot(1), makeSnapshot(2)];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();
      expect(result.snapshotsUsed).toBe(3);
      expect(PredictionResultSchema.parse(result)).toBeTruthy();
    });
  });

  describe('baseline forecasts with no estimator', () => {
    let engine: PredictionEngine;

    beforeEach(() => {
      // 5 snapshots with complexity increasing linearly: 40, 45, 50, 55, 60
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      engine = new PredictionEngine('/tmp/test', tm, null);
    });

    it('returns all 7 categories', () => {
      const result = engine.predict();
      for (const cat of ALL_CATEGORIES) {
        expect(result.categories[cat]).toBeDefined();
      }
    });

    it('returns valid PredictionResult (Zod parse succeeds)', () => {
      const result = engine.predict();
      expect(() => PredictionResultSchema.parse(result)).not.toThrow();
    });

    it('projects increasing values for complexity', () => {
      const result = engine.predict();
      const forecast = result.categories['complexity']!.baseline;
      expect(forecast.current).toBe(60);
      expect(forecast.projectedValue4w).toBeGreaterThan(60);
      expect(forecast.projectedValue8w).toBeGreaterThan(forecast.projectedValue4w);
      expect(forecast.projectedValue12w).toBeGreaterThan(forecast.projectedValue8w);
    });

    it('computes threshold crossing for complexity (threshold=100)', () => {
      const result = engine.predict();
      const forecast = result.categories['complexity']!.baseline;
      expect(forecast.thresholdCrossingWeeks).toBeGreaterThan(0);
      expect(forecast.thresholdCrossingWeeks).not.toBeNull();
    });

    it('returns null threshold crossing for zero-value categories', () => {
      const result = engine.predict();
      const forecast = result.categories['circular-deps']!.baseline;
      expect(forecast.current).toBe(0);
      expect(forecast.thresholdCrossingWeeks).toBeNull();
    });

    it('adjusted equals baseline when no estimator', () => {
      const result = engine.predict();
      for (const cat of ALL_CATEGORIES) {
        const af = result.categories[cat]!;
        expect(af.adjusted).toEqual(af.baseline);
        expect(af.contributingFeatures).toEqual([]);
      }
    });

    it('classifies direction correctly', () => {
      const result = engine.predict();
      // complexity is increasing -> declining
      expect(result.categories['complexity']!.baseline.direction).toBe('declining');
      // zero categories -> stable
      expect(result.categories['circular-deps']!.baseline.direction).toBe('stable');
    });

    it('includes timelineRange from first to last snapshot', () => {
      const result = engine.predict();
      expect(result.timelineRange.from).toContain('2026-01-05');
      expect(result.timelineRange.to).toContain('2026-02-02');
    });

    it('sets snapshotsUsed correctly', () => {
      const result = engine.predict();
      expect(result.snapshotsUsed).toBe(5);
    });
  });

  describe('warnings', () => {
    it('generates critical warning for threshold crossing <= 4 weeks with high confidence', () => {
      // complexity at 95, threshold 100, slope ~5/week -> crosses in 1 week
      const snapshots = [
        makeSnapshot(0, { complexity: 70 }),
        makeSnapshot(1, { complexity: 75 }),
        makeSnapshot(2, { complexity: 80 }),
        makeSnapshot(3, { complexity: 85 }),
        makeSnapshot(4, { complexity: 90 }),
        makeSnapshot(5, { complexity: 95 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();

      const criticals = result.warnings.filter((w) => w.severity === 'critical');
      expect(criticals.length).toBeGreaterThanOrEqual(1);
      expect(criticals[0]!.category).toBe('complexity');
      expect(criticals[0]!.weeksUntil).toBeLessThanOrEqual(4);
    });

    it('generates warning severity for threshold crossing <= 8 weeks', () => {
      // complexity at 65, threshold 100, slope ~5/week -> crosses in ~7 weeks
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
        makeSnapshot(5, { complexity: 65 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();

      const warnings = result.warnings.filter((w) => w.severity === 'warning');
      expect(warnings.length).toBeGreaterThanOrEqual(1);
      expect(warnings[0]!.category).toBe('complexity');
    });

    it('generates info severity for threshold crossing <= 12 weeks', () => {
      // complexity at 50, threshold 100, slope ~5/week -> crosses in ~10 weeks
      const snapshots = [
        makeSnapshot(0, { complexity: 25 }),
        makeSnapshot(1, { complexity: 30 }),
        makeSnapshot(2, { complexity: 35 }),
        makeSnapshot(3, { complexity: 40 }),
        makeSnapshot(4, { complexity: 45 }),
        makeSnapshot(5, { complexity: 50 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();

      const infos = result.warnings.filter((w) => w.severity === 'info');
      expect(infos.length).toBeGreaterThanOrEqual(1);
      expect(infos[0]!.category).toBe('complexity');
    });

    it('does not generate warnings for stable/improving categories', () => {
      // all categories at zero, stable
      const snapshots = [
        makeSnapshot(0),
        makeSnapshot(1),
        makeSnapshot(2),
        makeSnapshot(3),
        makeSnapshot(4),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();
      expect(result.warnings).toEqual([]);
    });

    it('warning contributingFeatures is empty in baseline mode', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 70 }),
        makeSnapshot(1, { complexity: 75 }),
        makeSnapshot(2, { complexity: 80 }),
        makeSnapshot(3, { complexity: 85 }),
        makeSnapshot(4, { complexity: 90 }),
        makeSnapshot(5, { complexity: 95 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();
      for (const w of result.warnings) {
        expect(w.contributingFeatures).toEqual([]);
      }
    });
  });

  describe('stability forecast', () => {
    it('computes composite stability forecast', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();

      expect(result.stabilityForecast.current).toBeGreaterThan(0);
      expect(result.stabilityForecast.current).toBeLessThanOrEqual(100);
      // With complexity increasing, projected stability should decrease
      expect(result.stabilityForecast.projected12w).toBeLessThanOrEqual(
        result.stabilityForecast.current
      );
    });

    it('stability forecast has valid confidence and direction', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict();

      expect(['high', 'medium', 'low']).toContain(result.stabilityForecast.confidence);
      expect(['improving', 'stable', 'declining']).toContain(result.stabilityForecast.direction);
    });
  });

  describe('options', () => {
    it('respects categories filter', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40, coupling: 0.5 }),
        makeSnapshot(1, { complexity: 45, coupling: 0.6 }),
        makeSnapshot(2, { complexity: 50, coupling: 0.7 }),
        makeSnapshot(3, { complexity: 55, coupling: 0.8 }),
        makeSnapshot(4, { complexity: 60, coupling: 0.9 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);
      const result = engine.predict({ categories: ['complexity', 'coupling'] });

      // Should still have all 7 categories in result but only filtered ones get full regression
      expect(result.categories['complexity']).toBeDefined();
      expect(result.categories['coupling']).toBeDefined();
    });

    it('respects custom thresholds', () => {
      const snapshots = [
        makeSnapshot(0, { complexity: 40 }),
        makeSnapshot(1, { complexity: 45 }),
        makeSnapshot(2, { complexity: 50 }),
        makeSnapshot(3, { complexity: 55 }),
        makeSnapshot(4, { complexity: 60 }),
      ];
      const tm = mockTimelineManager({ version: 1, snapshots });
      const engine = new PredictionEngine('/tmp/test', tm, null);

      // With threshold=200, crossing should be further out (or null)
      const result = engine.predict({ thresholds: { complexity: 200 } });
      const forecast = result.categories['complexity']!.baseline;
      expect(forecast.threshold).toBe(200);
    });
  });
});
```

2. Run test: `cd packages/core && npx vitest run tests/architecture/prediction-engine.test.ts`
3. Observe: all tests fail with "Cannot find module '../../src/architecture/prediction-engine'"
4. Run: `harness validate`
5. Commit: `test(prediction): add PredictionEngine test suite with mock timeline data`

---

### Task 2: Implement PredictionEngine -- snapshot conversion and per-category regression

**Depends on:** Task 1
**Files:** `packages/core/src/architecture/prediction-engine.ts`

1. Create `packages/core/src/architecture/prediction-engine.ts`:

```typescript
import { ArchMetricCategorySchema } from './types';
import type { ArchMetricCategory } from './types';
import { DEFAULT_STABILITY_THRESHOLDS } from './timeline-types';
import type { TimelineManager } from './timeline-manager';
import type { TimelineSnapshot } from './timeline-types';
import {
  applyRecencyWeights,
  weightedLinearRegression,
  projectValue,
  weeksUntilThreshold,
  classifyConfidence,
} from './regression';
import type { RegressionFit } from './regression';
import type {
  PredictionResult,
  PredictionOptions,
  CategoryForecast,
  AdjustedForecast,
  PredictionWarning,
  StabilityForecast,
  Direction,
  ConfidenceTier,
} from './prediction-types';

const ALL_CATEGORIES = ArchMetricCategorySchema.options;
const DIRECTION_THRESHOLD = 0.001; // slope magnitude below this is "stable"

/**
 * PredictionEngine: orchestrates weighted regression over timeline snapshots
 * to produce per-category forecasts and warnings.
 *
 * Phase 2: baseline predictions only (no roadmap/spec impact).
 * The estimator parameter is accepted but unused until Phase 3.
 */
export class PredictionEngine {
  constructor(
    private readonly rootDir: string,
    private readonly timelineManager: TimelineManager,
    private readonly estimator: unknown | null // Phase 3: SpecImpactEstimator
  ) {}

  /**
   * Produce a PredictionResult with per-category forecasts and warnings.
   * Throws if fewer than 3 snapshots are available.
   */
  predict(options?: Partial<PredictionOptions>): PredictionResult {
    const opts = this.resolveOptions(options);
    const timeline = this.timelineManager.load();
    const snapshots = timeline.snapshots;

    if (snapshots.length < 3) {
      throw new Error(
        `PredictionEngine requires at least 3 snapshots, got ${snapshots.length}. ` +
          'Run "harness snapshot" to capture more data points.'
      );
    }

    const thresholds = this.resolveThresholds(opts);
    const categoriesToProcess = opts.categories ?? [...ALL_CATEGORIES];
    const categories: Record<string, AdjustedForecast> = {};

    // Convert snapshot dates to week offsets from first snapshot
    const firstDate = new Date(snapshots[0]!.capturedAt).getTime();
    const lastSnapshot = snapshots[snapshots.length - 1]!;
    const currentT =
      (new Date(lastSnapshot.capturedAt).getTime() - firstDate) / (7 * 24 * 60 * 60 * 1000);

    for (const category of ALL_CATEGORIES) {
      const threshold = thresholds[category];
      const shouldProcess = categoriesToProcess.includes(category);

      if (!shouldProcess) {
        // Still include in result with zero forecast
        const zeroForecast = this.zeroForecast(category, threshold);
        categories[category] = {
          baseline: zeroForecast,
          adjusted: zeroForecast,
          contributingFeatures: [],
        };
        continue;
      }

      const timeSeries = this.extractTimeSeries(snapshots, category, firstDate);
      const forecast = this.forecastCategory(category, timeSeries, currentT, threshold);

      // Phase 2: adjusted = baseline (no estimator)
      categories[category] = {
        baseline: forecast,
        adjusted: forecast,
        contributingFeatures: [],
      };
    }

    const warnings = this.generateWarnings(
      categories as Record<ArchMetricCategory, AdjustedForecast>
    );
    const stabilityForecast = this.computeStabilityForecast(
      categories as Record<ArchMetricCategory, AdjustedForecast>,
      thresholds,
      snapshots
    );

    return {
      generatedAt: new Date().toISOString(),
      snapshotsUsed: snapshots.length,
      timelineRange: {
        from: snapshots[0]!.capturedAt,
        to: lastSnapshot.capturedAt,
      },
      stabilityForecast,
      categories: categories as Record<ArchMetricCategory, AdjustedForecast>,
      warnings,
    };
  }

  // --- Private helpers ---

  private resolveOptions(options?: Partial<PredictionOptions>): PredictionOptions {
    return {
      horizon: options?.horizon ?? 12,
      includeRoadmap: options?.includeRoadmap ?? true,
      categories: options?.categories,
      thresholds: options?.thresholds,
    };
  }

  private resolveThresholds(opts: PredictionOptions): Record<ArchMetricCategory, number> {
    const base = { ...DEFAULT_STABILITY_THRESHOLDS };
    if (opts.thresholds) {
      for (const [key, value] of Object.entries(opts.thresholds)) {
        if (value !== undefined) {
          base[key as ArchMetricCategory] = value;
        }
      }
    }
    return base;
  }

  /**
   * Extract time series for a single category from snapshots.
   * Returns array of { t (weeks from first), value } sorted oldest first.
   */
  private extractTimeSeries(
    snapshots: TimelineSnapshot[],
    category: ArchMetricCategory,
    firstDateMs: number
  ): Array<{ t: number; value: number }> {
    return snapshots.map((s) => {
      const t = (new Date(s.capturedAt).getTime() - firstDateMs) / (7 * 24 * 60 * 60 * 1000);
      const metrics = s.metrics as Record<
        ArchMetricCategory,
        { value: number; violationCount: number }
      >;
      const value = metrics[category]?.value ?? 0;
      return { t, value };
    });
  }

  /**
   * Produce a CategoryForecast for a single category using regression.
   */
  private forecastCategory(
    category: ArchMetricCategory,
    timeSeries: Array<{ t: number; value: number }>,
    currentT: number,
    threshold: number
  ): CategoryForecast {
    const weighted = applyRecencyWeights(timeSeries, 0.85);
    const fit = weightedLinearRegression(weighted);

    const current = timeSeries[timeSeries.length - 1]!.value;
    const projected4w = projectValue(fit, currentT + 4);
    const projected8w = projectValue(fit, currentT + 8);
    const projected12w = projectValue(fit, currentT + 12);
    const crossing = weeksUntilThreshold(fit, currentT, threshold);
    const confidence = classifyConfidence(fit.rSquared, fit.dataPoints);
    const direction = this.classifyDirection(fit.slope);

    return {
      category,
      current,
      threshold,
      projectedValue4w: projected4w,
      projectedValue8w: projected8w,
      projectedValue12w: projected12w,
      thresholdCrossingWeeks: crossing,
      confidence,
      regression: {
        slope: fit.slope,
        intercept: fit.intercept,
        rSquared: fit.rSquared,
        dataPoints: fit.dataPoints,
      },
      direction,
    };
  }

  private classifyDirection(slope: number): Direction {
    if (Math.abs(slope) < DIRECTION_THRESHOLD) return 'stable';
    return slope > 0 ? 'declining' : 'improving'; // higher metric values = worse
  }

  private zeroForecast(category: ArchMetricCategory, threshold: number): CategoryForecast {
    return {
      category,
      current: 0,
      threshold,
      projectedValue4w: 0,
      projectedValue8w: 0,
      projectedValue12w: 0,
      thresholdCrossingWeeks: null,
      confidence: 'low',
      regression: { slope: 0, intercept: 0, rSquared: 0, dataPoints: 0 },
      direction: 'stable',
    };
  }

  /**
   * Generate warnings based on severity rules from spec:
   * - critical: threshold crossing <= 4w, confidence high or medium
   * - warning: threshold crossing <= 8w, confidence high or medium
   * - info: threshold crossing <= 12w, any confidence
   */
  private generateWarnings(
    categories: Record<ArchMetricCategory, AdjustedForecast>
  ): PredictionWarning[] {
    const warnings: PredictionWarning[] = [];

    for (const category of ALL_CATEGORIES) {
      const af = categories[category];
      if (!af) continue;

      // Use adjusted forecast for warning (in baseline mode, adjusted === baseline)
      const forecast = af.adjusted;
      const crossing = forecast.thresholdCrossingWeeks;

      if (crossing === null || crossing <= 0) continue;

      let severity: 'critical' | 'warning' | 'info' | null = null;

      if (crossing <= 4 && (forecast.confidence === 'high' || forecast.confidence === 'medium')) {
        severity = 'critical';
      } else if (
        crossing <= 8 &&
        (forecast.confidence === 'high' || forecast.confidence === 'medium')
      ) {
        severity = 'warning';
      } else if (crossing <= 12) {
        severity = 'info';
      }

      if (severity) {
        const contributingNames = af.contributingFeatures.map((f) => f.name);
        warnings.push({
          severity,
          category,
          message: `${category} projected to exceed threshold (~${crossing}w, ${forecast.confidence} confidence)`,
          weeksUntil: crossing,
          confidence: forecast.confidence,
          contributingFeatures: contributingNames,
        });
      }
    }

    return warnings;
  }

  /**
   * Compute composite stability forecast by projecting per-category values
   * forward and computing stability scores at each horizon.
   */
  private computeStabilityForecast(
    categories: Record<ArchMetricCategory, AdjustedForecast>,
    thresholds: Record<ArchMetricCategory, number>,
    snapshots: TimelineSnapshot[]
  ): StabilityForecast {
    // Current stability: compute from latest snapshot values
    const currentMetrics = this.buildMetricsFromForecasts(categories, 'current');
    const current = this.timelineManager.computeStabilityScore(currentMetrics, thresholds);

    // Projected stability at 4w, 8w, 12w
    const metrics4w = this.buildMetricsFromForecasts(categories, '4w');
    const projected4w = this.timelineManager.computeStabilityScore(metrics4w, thresholds);

    const metrics8w = this.buildMetricsFromForecasts(categories, '8w');
    const projected8w = this.timelineManager.computeStabilityScore(metrics8w, thresholds);

    const metrics12w = this.buildMetricsFromForecasts(categories, '12w');
    const projected12w = this.timelineManager.computeStabilityScore(metrics12w, thresholds);

    // Direction based on current vs 12w projection
    const delta = projected12w - current;
    let direction: Direction;
    if (Math.abs(delta) < 2) {
      direction = 'stable';
    } else {
      direction = delta > 0 ? 'improving' : 'declining'; // higher stability = better
    }

    // Composite confidence: median of category confidences
    const confidences = ALL_CATEGORIES.map((c) => categories[c]?.adjusted.confidence ?? 'low');
    const confidence = this.medianConfidence(confidences);

    return { current, projected4w, projected8w, projected12w, confidence, direction };
  }

  private buildMetricsFromForecasts(
    categories: Record<ArchMetricCategory, AdjustedForecast>,
    horizon: 'current' | '4w' | '8w' | '12w'
  ): Record<ArchMetricCategory, { value: number; violationCount: number }> {
    const metrics: Record<string, { value: number; violationCount: number }> = {};
    for (const cat of ALL_CATEGORIES) {
      const forecast = categories[cat]?.adjusted;
      let value = 0;
      if (forecast) {
        switch (horizon) {
          case 'current':
            value = forecast.current;
            break;
          case '4w':
            value = forecast.projectedValue4w;
            break;
          case '8w':
            value = forecast.projectedValue8w;
            break;
          case '12w':
            value = forecast.projectedValue12w;
            break;
        }
      }
      metrics[cat] = { value: Math.max(0, value), violationCount: 0 };
    }
    return metrics as Record<ArchMetricCategory, { value: number; violationCount: number }>;
  }

  private medianConfidence(confidences: ConfidenceTier[]): ConfidenceTier {
    const order: Record<ConfidenceTier, number> = { low: 0, medium: 1, high: 2 };
    const sorted = [...confidences].sort((a, b) => order[a] - order[b]);
    const mid = Math.floor(sorted.length / 2);
    return sorted[mid] ?? 'low';
  }
}
```

2. Run test: `cd packages/core && npx vitest run tests/architecture/prediction-engine.test.ts`
3. Observe: all tests pass
4. Run: `harness validate`
5. Commit: `feat(prediction): implement baseline PredictionEngine with per-category regression`

---

### Task 3: Add warning severity and stability forecast tests

**Depends on:** Task 2
**Files:** `packages/core/tests/architecture/prediction-engine.test.ts`

This task verifies the tests from Task 1 all pass with the implementation from Task 2. If any test fails, fix the implementation. This is the "observe green" step of TDD.

1. Run full test suite: `cd packages/core && npx vitest run tests/architecture/prediction-engine.test.ts --reporter=verbose`
2. Observe: all tests pass (edge cases, baseline forecasts, warnings, stability, options)
3. If any test fails, diagnose and fix the issue in either test or implementation
4. Run: `harness validate`
5. Commit: `test(prediction): verify PredictionEngine test suite passes all 20+ assertions`

---

### Task 4: Update barrel exports for PredictionEngine

**Depends on:** Task 2
**Files:** `packages/core/src/architecture/index.ts`

1. Add export to `packages/core/src/architecture/index.ts`. Append after the regression exports block (after line 109):

```typescript
export { PredictionEngine } from './prediction-engine';
```

2. Run: `cd packages/core && npx vitest run tests/architecture/prediction-engine.test.ts`
3. Observe: tests still pass
4. Run: `harness validate`
5. Run: `harness check-deps`
6. Commit: `feat(prediction): export PredictionEngine from architecture barrel`

---

### Task 5: End-to-end validation and Zod schema compliance

**Depends on:** Task 3, Task 4
**Files:** none (validation only)

[checkpoint:human-verify] -- Review PredictionEngine output for correctness before proceeding to Phase 3.

1. Run full architecture test suite: `cd packages/core && npx vitest run tests/architecture/ --reporter=verbose`
2. Observe: all existing tests (regression, prediction-types, timeline-manager, etc.) still pass alongside new prediction-engine tests
3. Run: `harness validate`
4. Verify observable truths:
   - OT1: Result has 7 categories with 4w/8w/12w projections (tested in "returns all 7 categories" and "projects increasing values")
   - OT2: Positive crossing weeks for declining categories (tested in "computes threshold crossing for complexity")
   - OT3: Null crossing for stable categories (tested in "returns null threshold crossing for zero-value categories")
   - OT4: Error on < 3 snapshots (tested in "throws when fewer than 3 snapshots")
   - OT5: Zero forecast for empty categories (tested in "returns null threshold crossing for zero-value categories")
   - OT6: Warning severities correct (tested in critical/warning/info warning tests)
   - OT7: Adjusted equals baseline (tested in "adjusted equals baseline when no estimator")
   - OT8: Stability forecast computed (tested in stability forecast describe block)
   - OT9: Zod parse succeeds (tested in "returns valid PredictionResult")
   - OT10: All tests green (this task)
5. Commit: `test(prediction): validate Phase 2 PredictionEngine end-to-end`
