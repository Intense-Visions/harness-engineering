import { z } from 'zod';
import { ArchMetricCategorySchema } from './types';
import type { ArchMetricCategory } from './types';

// --- Category Snapshot ---

export const CategorySnapshotSchema = z.object({
  /** Aggregate metric value (e.g., violation count, avg complexity) */
  value: z.number(),
  /** Count of violations in this category */
  violationCount: z.number(),
});

export type CategorySnapshot = z.infer<typeof CategorySnapshotSchema>;

// --- Timeline Snapshot ---

export const TimelineSnapshotSchema = z.object({
  /** ISO 8601 timestamp of capture */
  capturedAt: z.string().datetime(),
  /** Git commit hash at capture time */
  commitHash: z.string(),
  /** Composite stability score (0-100, higher is healthier) */
  stabilityScore: z.number().min(0).max(100),
  /** Per-category metric aggregates */
  metrics: z.record(ArchMetricCategorySchema, CategorySnapshotSchema),
});

export type TimelineSnapshot = z.infer<typeof TimelineSnapshotSchema>;

// --- Timeline File ---

export const TimelineFileSchema = z.object({
  version: z.literal(1),
  snapshots: z.array(TimelineSnapshotSchema),
});

export type TimelineFile = z.infer<typeof TimelineFileSchema>;

// --- Trend Line ---

export const TrendLineSchema = z.object({
  /** Current value */
  current: z.number(),
  /** Previous value (from comparison snapshot) */
  previous: z.number(),
  /** Absolute delta (current - previous) */
  delta: z.number(),
  /** Direction indicator */
  direction: z.enum(['improving', 'stable', 'declining']),
});

export type TrendLine = z.infer<typeof TrendLineSchema>;

// --- Trend Result ---

export const TrendResultSchema = z.object({
  /** Overall stability trend */
  stability: TrendLineSchema,
  /** Per-category trends */
  categories: z.record(ArchMetricCategorySchema, TrendLineSchema),
  /** Number of snapshots analyzed */
  snapshotCount: z.number(),
  /** Time range covered */
  from: z.string(),
  to: z.string(),
});

export type TrendResult = z.infer<typeof TrendResultSchema>;

// --- Default thresholds for stability score computation ---

/**
 * Reasonable ceiling per category for normalizing health scores.
 * health = max(0, 1 - (value / threshold))
 * Categories at or above threshold get health = 0.
 */
export const DEFAULT_STABILITY_THRESHOLDS: Record<ArchMetricCategory, number> = {
  'circular-deps': 5,
  'layer-violations': 10,
  complexity: 100,
  coupling: 2,
  'forbidden-imports': 5,
  'module-size': 10,
  'dependency-depth': 10,
};
