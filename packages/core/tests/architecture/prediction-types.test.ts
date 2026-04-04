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
