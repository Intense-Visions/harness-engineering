import { z } from 'zod';

/**
 * Canary adapter — a total, gracefully-degrading boundary around the deterministic
 * `canary` test CLI (`canary-test-cli`, declared as an optionalDependency).
 *
 * All `canary` / `canary-test-cli` references are confined to this module
 * (enforced by a boundary test). The adapter never throws on a missing or
 * misbehaving CLI: every method resolves a degraded/empty result instead.
 */

/** Why probe() degraded. */
export type CanaryDegradeReason = 'not-installed' | 'binary-missing' | 'exec-failed' | 'bad-output';

export interface CanaryProbe {
  status: 'available' | 'degraded';
  version?: string;
  reason?: CanaryDegradeReason;
}

// canary recommend "<prompt>" --json
export const frameworkRecommendationSchema = z.object({
  status: z.string(),
  test_type: z.string(),
  framework: z.string(),
  file_extension: z.string(),
  reasoning: z.array(z.string()),
  alternatives: z.array(z.string()),
});
export type FrameworkRecommendation = z.infer<typeof frameworkRecommendationSchema>;

// canary review-test <path> --json → array
export const canaryFindingSchema = z.object({
  file: z.string(),
  line: z.number(),
  rule: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string(),
  suggestion: z.string(),
});
export const canaryFindingsSchema = z.array(canaryFindingSchema);
export type CanaryFinding = z.infer<typeof canaryFindingSchema>;

export interface CanaryAdapter {
  probe(): Promise<CanaryProbe>;
  recommendFramework(prompt: string): Promise<FrameworkRecommendation>;
  reviewTest(path: string, framework?: string): Promise<CanaryFinding[]>;
}
