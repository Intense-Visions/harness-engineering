import { z } from 'zod';

// --- Metric Categories ---

export const ArchMetricCategorySchema = z.enum([
  'circular-deps',
  'layer-violations',
  'complexity',
  'coupling',
  'forbidden-imports',
  'module-size',
  'dependency-depth',
]);

export type ArchMetricCategory = z.infer<typeof ArchMetricCategorySchema>;

// --- Violation ---

export const ViolationSchema = z.object({
  id: z.string(), // stable hash: sha256(relativePath + ':' + category + ':' + normalizedDetail)
  file: z.string(), // relative to project root
  category: ArchMetricCategorySchema.optional(), // context for baseline reporting
  detail: z.string(), // human-readable description
  severity: z.enum(['error', 'warning']),
});

export type Violation = z.infer<typeof ViolationSchema>;

// --- Metric Result ---

export const MetricResultSchema = z.object({
  category: ArchMetricCategorySchema,
  scope: z.string(), // e.g., 'project', 'src/services', 'src/api/routes.ts'
  value: z.number(), // numeric metric (violation count, complexity score, etc.)
  violations: z.array(ViolationSchema),
  metadata: z.record(z.unknown()).optional(),
});

export type MetricResult = z.infer<typeof MetricResultSchema>;

// --- Category Baseline ---

export const CategoryBaselineSchema = z.object({
  value: z.number(), // aggregate metric value at baseline time
  violationIds: z.array(z.string()), // stable IDs of known violations (the allowlist)
});

export type CategoryBaseline = z.infer<typeof CategoryBaselineSchema>;

// --- Arch Baseline ---

export const ArchBaselineSchema = z.object({
  version: z.literal(1),
  updatedAt: z.string().datetime(), // ISO 8601
  updatedFrom: z.string(), // commit hash
  metrics: z.record(ArchMetricCategorySchema, CategoryBaselineSchema),
});

export type ArchBaseline = z.infer<typeof ArchBaselineSchema>;

// --- Category Regression ---

export const CategoryRegressionSchema = z.object({
  category: ArchMetricCategorySchema,
  baselineValue: z.number(),
  currentValue: z.number(),
  delta: z.number(),
});

export type CategoryRegression = z.infer<typeof CategoryRegressionSchema>;

// --- Arch Diff Result ---

export const ArchDiffResultSchema = z.object({
  passed: z.boolean(),
  newViolations: z.array(ViolationSchema), // in current but not in baseline -> FAIL
  resolvedViolations: z.array(z.string()), // in baseline but not in current -> celebrate
  preExisting: z.array(z.string()), // in both -> allowed, tracked
  regressions: z.array(CategoryRegressionSchema), // aggregate value exceeded baseline
});

export type ArchDiffResult = z.infer<typeof ArchDiffResultSchema>;

// --- Threshold Config ---

export const ThresholdConfigSchema = z.record(
  ArchMetricCategorySchema,
  z.union([z.number(), z.record(z.string(), z.number())])
);

export type ThresholdConfig = z.infer<typeof ThresholdConfigSchema>;

// --- Arch Config ---

export const ArchConfigSchema = z.object({
  enabled: z.boolean().default(true),
  baselinePath: z.string().default('.harness/arch/baselines.json'),
  thresholds: ThresholdConfigSchema.default({}),
  modules: z.record(z.string(), ThresholdConfigSchema).default({}),
});

export type ArchConfig = z.infer<typeof ArchConfigSchema>;

// --- Constraint Rule ---

export const ConstraintRuleSchema = z.object({
  id: z.string(), // stable hash: sha256(category + ':' + scope + ':' + description)
  category: ArchMetricCategorySchema,
  description: z.string(), // e.g., "Layer 'services' must not import from 'ui'"
  scope: z.string(), // e.g., 'src/services/', 'project'
  targets: z.array(z.string()).optional(), // forward-compat for governs edges
});

export type ConstraintRule = z.infer<typeof ConstraintRuleSchema>;

// --- Collector Interface ---

/**
 * Collector interface for architecture metric collection.
 * Each collector is responsible for a single metric category.
 * Cannot be expressed as a Zod schema because it has methods.
 */
export interface Collector {
  category: ArchMetricCategory;
  collect(config: ArchConfig, rootDir: string): Promise<MetricResult[]>;
  getRules(config: ArchConfig, rootDir: string): ConstraintRule[];
}
