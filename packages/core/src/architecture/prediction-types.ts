import { z } from 'zod';
import { ArchMetricCategorySchema } from './types';

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
