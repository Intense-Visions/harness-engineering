import { z } from 'zod';

/**
 * Schema for a single rule configuration in harness-linter.yml
 */
export const RuleConfigSchema = z.object({
  /** Rule name in kebab-case (e.g., 'no-ui-in-services') */
  name: z.string().regex(/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/, 'Rule name must be kebab-case'),
  /** Rule type - determines which template to use */
  type: z.string().min(1),
  /** ESLint severity level */
  severity: z.enum(['error', 'warn', 'off']).default('error'),
  /** Template-specific configuration */
  config: z.record(z.unknown()),
});

export type RuleConfig = z.infer<typeof RuleConfigSchema>;

/**
 * Schema for the complete harness-linter.yml configuration
 */
export const LinterConfigSchema = z.object({
  /** Config version - currently only 1 is supported */
  version: z.literal(1),
  /** Output directory for generated rules */
  output: z.string().min(1),
  /** Optional explicit template path mappings (type → path) */
  templates: z.record(z.string()).optional(),
  /** Rules to generate */
  rules: z.array(RuleConfigSchema).min(1, 'At least one rule is required'),
});

export type LinterConfig = z.infer<typeof LinterConfigSchema>;
