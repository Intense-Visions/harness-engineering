import { z } from 'zod';
import type { Result } from '../../shared/result';
import { Ok, Err } from '../../shared/result';
import type { EntropyError, PatternConfig } from '../types';
import { createEntropyError } from '../../shared/errors';

// Rule type schemas
const MustExportRuleSchema = z.object({
  type: z.literal('must-export'),
  names: z.array(z.string()),
});

const MustExportDefaultRuleSchema = z.object({
  type: z.literal('must-export-default'),
  kind: z.enum(['class', 'function', 'object']).optional(),
});

const NoExportRuleSchema = z.object({
  type: z.literal('no-export'),
  names: z.array(z.string()),
});

const MustImportRuleSchema = z.object({
  type: z.literal('must-import'),
  from: z.string(),
  names: z.array(z.string()).optional(),
});

const NoImportRuleSchema = z.object({
  type: z.literal('no-import'),
  from: z.string(),
});

const NamingRuleSchema = z.object({
  type: z.literal('naming'),
  match: z.string(),
  convention: z.enum(['camelCase', 'PascalCase', 'UPPER_SNAKE', 'kebab-case']),
});

const MaxExportsRuleSchema = z.object({
  type: z.literal('max-exports'),
  count: z.number().positive(),
});

const MaxLinesRuleSchema = z.object({
  type: z.literal('max-lines'),
  count: z.number().positive(),
});

const RequireJSDocRuleSchema = z.object({
  type: z.literal('require-jsdoc'),
  for: z.array(z.enum(['function', 'class', 'export'])),
});

// Combined rule schema
const RuleSchema = z.discriminatedUnion('type', [
  MustExportRuleSchema,
  MustExportDefaultRuleSchema,
  NoExportRuleSchema,
  MustImportRuleSchema,
  NoImportRuleSchema,
  NamingRuleSchema,
  MaxExportsRuleSchema,
  MaxLinesRuleSchema,
  RequireJSDocRuleSchema,
]);

// ConfigPattern schema
const ConfigPatternSchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  severity: z.enum(['error', 'warning']),
  files: z.array(z.string()),
  rule: RuleSchema,
  message: z.string().optional(),
});

// PatternConfig schema
export const PatternConfigSchema = z.object({
  patterns: z.array(ConfigPatternSchema),
  customPatterns: z.array(z.any()).optional(), // Code patterns are functions, can't validate
  ignoreFiles: z.array(z.string()).optional(),
});

// DriftConfig schema
const DriftConfigSchema = z.object({
  docPaths: z.array(z.string()).optional(),
  checkApiSignatures: z.boolean().optional(),
  checkExamples: z.boolean().optional(),
  checkStructure: z.boolean().optional(),
  ignorePatterns: z.array(z.string()).optional(),
});

// DeadCodeConfig schema
const DeadCodeConfigSchema = z.object({
  entryPoints: z.array(z.string()).optional(),
  includeTypes: z.boolean().optional(),
  includeInternals: z.boolean().optional(),
  ignorePatterns: z.array(z.string()).optional(),
  treatDynamicImportsAs: z.enum(['used', 'unknown']).optional(),
});

// Full EntropyConfig schema
export const EntropyConfigSchema = z.object({
  rootDir: z.string(),
  parser: z.any().optional(), // LanguageParser instance, can't validate
  entryPoints: z.array(z.string()).optional(),
  analyze: z.object({
    drift: z.union([z.boolean(), DriftConfigSchema]).optional(),
    deadCode: z.union([z.boolean(), DeadCodeConfigSchema]).optional(),
    patterns: z.union([z.boolean(), PatternConfigSchema]).optional(),
  }),
  include: z.array(z.string()).optional(),
  exclude: z.array(z.string()).optional(),
  docPaths: z.array(z.string()).optional(),
});

/**
 * Validate pattern config
 */
export function validatePatternConfig(config: unknown): Result<PatternConfig, EntropyError> {
  const result = PatternConfigSchema.safeParse(config);

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');

    return Err(
      createEntropyError(
        'CONFIG_VALIDATION_ERROR',
        `Invalid pattern config: ${issues}`,
        { issues: result.error.issues },
        ['Check the pattern config matches the schema']
      )
    );
  }

  return Ok(result.data as PatternConfig);
}
