import * as fs from 'node:fs';
import * as path from 'node:path';
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
  SpecImpactEstimate,
  Direction,
  ConfidenceTier,
} from './prediction-types';
import type { SpecImpactEstimator } from './spec-impact-estimator';
import { parseRoadmap } from '../roadmap/parse';

const ALL_CATEGORIES = ArchMetricCategorySchema.options;
const DIRECTION_THRESHOLD = 0.001; // slope magnitude below this is "stable"

/**
 * PredictionEngine: orchestrates weighted regression over timeline snapshots
 * to produce per-category forecasts and warnings.
 *
 * Supports roadmap-aware adjusted forecasts via SpecImpactEstimator.
 */
export class PredictionEngine {
  constructor(
    private readonly rootDir: string,
    private readonly timelineManager: TimelineManager,
    private readonly estimator: SpecImpactEstimator | null
  ) {}

  /**
   * Produce a PredictionResult with per-category forecasts and warnings.
   * Throws if fewer than 3 snapshots are available.
   */
  predict(options?: Partial<PredictionOptions>): PredictionResult {
    const opts = this.resolveOptions(options);
    const snapshots = this.loadValidatedSnapshots();
    const thresholds = this.resolveThresholds(opts);
    const categoriesToProcess = opts.categories ?? [...ALL_CATEGORIES];
    const { firstDate, lastSnapshot, currentT } = this.computeTimeOffsets(snapshots);

    const baselines = this.computeBaselines(
      categoriesToProcess,
      thresholds,
      snapshots,
      firstDate,
      currentT,
      opts.horizon
    );

    const specImpacts = this.computeSpecImpacts(opts);
    const categories = this.computeAdjustedForecasts(baselines, thresholds, specImpacts, currentT);
    const adjustedCategories = categories as Record<ArchMetricCategory, AdjustedForecast>;

    return {
      generatedAt: new Date().toISOString(),
      snapshotsUsed: snapshots.length,
      timelineRange: { from: snapshots[0]!.capturedAt, to: lastSnapshot.capturedAt },
      stabilityForecast: this.computeStabilityForecast(adjustedCategories, thresholds, snapshots),
      categories: adjustedCategories,
      warnings: this.generateWarnings(adjustedCategories, opts.horizon),
    };
  }

  private loadValidatedSnapshots(): TimelineSnapshot[] {
    const timeline = this.timelineManager.load();
    const snapshots = timeline.snapshots;
    if (snapshots.length < 3) {
      throw new Error(
        `PredictionEngine requires at least 3 snapshots, got ${snapshots.length}. ` +
          'Run "harness snapshot" to capture more data points.'
      );
    }
    return snapshots;
  }

  private computeTimeOffsets(snapshots: TimelineSnapshot[]): {
    firstDate: number;
    lastSnapshot: TimelineSnapshot;
    currentT: number;
  } {
    const firstDate = new Date(snapshots[0]!.capturedAt).getTime();
    const lastSnapshot = snapshots[snapshots.length - 1]!;
    const currentT =
      (new Date(lastSnapshot.capturedAt).getTime() - firstDate) / (7 * 24 * 60 * 60 * 1000);
    return { firstDate, lastSnapshot, currentT };
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

  private computeBaselines(
    categoriesToProcess: ArchMetricCategory[],
    thresholds: Record<ArchMetricCategory, number>,
    snapshots: TimelineSnapshot[],
    firstDate: number,
    currentT: number,
    horizon: number
  ): Record<string, CategoryForecast> {
    const baselines: Record<string, CategoryForecast> = {};
    for (const category of ALL_CATEGORIES) {
      const threshold = thresholds[category];
      if (!categoriesToProcess.includes(category)) {
        baselines[category] = this.zeroForecast(category, threshold);
        continue;
      }
      const timeSeries = this.extractTimeSeries(snapshots, category, firstDate);
      baselines[category] = this.forecastCategory(
        category,
        timeSeries,
        currentT,
        threshold,
        horizon
      );
    }
    return baselines;
  }

  private computeAdjustedForecasts(
    baselines: Record<string, CategoryForecast>,
    thresholds: Record<ArchMetricCategory, number>,
    specImpacts: SpecImpactEstimate[] | null,
    currentT: number
  ): Record<string, AdjustedForecast> {
    const categories: Record<string, AdjustedForecast> = {};
    for (const category of ALL_CATEGORIES) {
      const baseline = baselines[category]!;
      categories[category] = this.adjustForecastForCategory(
        category,
        baseline,
        thresholds[category],
        specImpacts,
        currentT
      );
    }
    return categories;
  }

  private adjustForecastForCategory(
    category: ArchMetricCategory,
    baseline: CategoryForecast,
    threshold: number,
    specImpacts: SpecImpactEstimate[] | null,
    currentT: number
  ): AdjustedForecast {
    if (!specImpacts || specImpacts.length === 0) {
      return { baseline, adjusted: baseline, contributingFeatures: [] };
    }

    let totalDelta = 0;
    const contributing: Array<{ name: string; specPath: string; delta: number }> = [];

    for (const impact of specImpacts) {
      const delta = impact.deltas?.[category] ?? 0;
      if (delta !== 0) {
        totalDelta += delta;
        contributing.push({ name: impact.featureName, specPath: impact.specPath, delta });
      }
    }

    if (totalDelta === 0) {
      return { baseline, adjusted: baseline, contributingFeatures: [] };
    }

    const adjusted: CategoryForecast = {
      ...baseline,
      projectedValue4w: baseline.projectedValue4w + totalDelta,
      projectedValue8w: baseline.projectedValue8w + totalDelta,
      projectedValue12w: baseline.projectedValue12w + totalDelta,
    };

    const adjustedFit: RegressionFit = {
      slope: baseline.regression.slope,
      intercept: baseline.regression.intercept + totalDelta,
      rSquared: baseline.regression.rSquared,
      dataPoints: baseline.regression.dataPoints,
    };
    adjusted.thresholdCrossingWeeks = weeksUntilThreshold(adjustedFit, currentT, threshold);
    adjusted.regression = {
      slope: adjustedFit.slope,
      intercept: adjustedFit.intercept,
      rSquared: adjustedFit.rSquared,
      dataPoints: adjustedFit.dataPoints,
    };

    return { baseline, adjusted, contributingFeatures: contributing };
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
    threshold: number,
    horizon: number = 12
  ): CategoryForecast {
    const weighted = applyRecencyWeights(timeSeries, 0.85);
    const fit = weightedLinearRegression(weighted);

    const current = timeSeries[timeSeries.length - 1]!.value;
    const h3 = Math.round(horizon / 3);
    const h2 = Math.round((horizon * 2) / 3);
    const projected4w = projectValue(fit, currentT + h3);
    const projected8w = projectValue(fit, currentT + h2);
    const projected12w = projectValue(fit, currentT + horizon);
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
    categories: Record<ArchMetricCategory, AdjustedForecast>,
    horizon: number = 12
  ): PredictionWarning[] {
    const warnings: PredictionWarning[] = [];
    const criticalWindow = Math.round(horizon / 3);
    const warningWindow = Math.round((horizon * 2) / 3);

    for (const category of ALL_CATEGORIES) {
      const af = categories[category];
      if (!af) continue;

      const warning = this.buildCategoryWarning(
        category,
        af,
        criticalWindow,
        warningWindow,
        horizon
      );
      if (warning) warnings.push(warning);
    }

    return warnings;
  }

  private buildCategoryWarning(
    category: ArchMetricCategory,
    af: AdjustedForecast,
    criticalWindow: number,
    warningWindow: number,
    horizon: number
  ): PredictionWarning | null {
    const forecast = af.adjusted;
    const crossing = forecast.thresholdCrossingWeeks;

    if (crossing === null || crossing <= 0) return null;

    const isHighConfidence =
      forecast.confidence === 'high' || forecast.confidence === 'medium';
    let severity: 'critical' | 'warning' | 'info' | null = null;

    if (crossing <= criticalWindow && isHighConfidence) {
      severity = 'critical';
    } else if (crossing <= warningWindow && isHighConfidence) {
      severity = 'warning';
    } else if (crossing <= horizon) {
      severity = 'info';
    }

    if (!severity) return null;

    return {
      severity,
      category,
      message: `${category} projected to exceed threshold (~${crossing}w, ${forecast.confidence} confidence)`,
      weeksUntil: crossing,
      confidence: forecast.confidence,
      contributingFeatures: af.contributingFeatures.map((f) => f.name),
    };
  }

  /**
   * Compute composite stability forecast by projecting per-category values
   * forward and computing stability scores at each horizon.
   */
  private computeStabilityForecast(
    categories: Record<ArchMetricCategory, AdjustedForecast>,
    thresholds: Record<ArchMetricCategory, number>,
    _snapshots: TimelineSnapshot[]
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

  /**
   * Load roadmap features, estimate spec impacts via the estimator.
   * Returns null if estimator is null or includeRoadmap is false.
   */
  private computeSpecImpacts(opts: PredictionOptions): SpecImpactEstimate[] | null {
    if (!this.estimator || !opts.includeRoadmap) {
      return null;
    }

    try {
      const roadmapPath = path.join(this.rootDir, 'roadmap.md');
      const raw = fs.readFileSync(roadmapPath, 'utf-8');
      const parseResult = parseRoadmap(raw);

      if (!parseResult.ok) return null;

      // Collect all features with specs across all milestones
      const features = parseResult.value.milestones.flatMap((m) =>
        m.features
          .filter((f) => f.status === 'planned' || f.status === 'in-progress')
          .map((f) => ({ name: f.name, spec: f.spec }))
      );

      if (features.length === 0) return null;

      return this.estimator.estimateAll(features);
    } catch {
      // If roadmap doesn't exist or can't be parsed, proceed without it
      return null;
    }
  }
}
