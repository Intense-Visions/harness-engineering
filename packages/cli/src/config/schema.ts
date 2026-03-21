import { z } from 'zod';

export const LayerSchema = z.object({
  name: z.string(),
  pattern: z.string(),
  allowedDependencies: z.array(z.string()),
});

export const ForbiddenImportSchema = z.object({
  from: z.string(),
  disallow: z.array(z.string()),
  message: z.string().optional(),
});

export const BoundaryConfigSchema = z.object({
  requireSchema: z.array(z.string()),
});

export const AgentConfigSchema = z.object({
  executor: z.enum(['subprocess', 'cloud', 'noop']).default('subprocess'),
  timeout: z.number().default(300000),
  skills: z.array(z.string()).optional(),
});

export const EntropyConfigSchema = z.object({
  excludePatterns: z.array(z.string()).default(['**/node_modules/**', '**/*.test.ts']),
  autoFix: z.boolean().default(false),
});

export const PhaseGateMappingSchema = z.object({
  implPattern: z.string(),
  specPattern: z.string(),
});

export const PhaseGatesConfigSchema = z.object({
  enabled: z.boolean().default(false),
  severity: z.enum(['error', 'warning']).default('error'),
  mappings: z
    .array(PhaseGateMappingSchema)
    .default([{ implPattern: 'src/**/*.ts', specPattern: 'docs/specs/{feature}.md' }]),
});

export const SecurityConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    strict: z.boolean().default(false),
    rules: z.record(z.string(), z.enum(['off', 'error', 'warning', 'info'])).optional(),
    exclude: z.array(z.string()).optional(),
  })
  .passthrough();

export const PerformanceConfigSchema = z
  .object({
    complexity: z.record(z.unknown()).optional(),
    coupling: z.record(z.unknown()).optional(),
    sizeBudget: z.record(z.unknown()).optional(),
  })
  .passthrough();

export const DesignConfigSchema = z.object({
  strictness: z.enum(['strict', 'standard', 'permissive']).default('standard'),
  platforms: z.array(z.enum(['web', 'mobile'])).default([]),
  tokenPath: z.string().optional(),
  aestheticIntent: z.string().optional(),
});

export const I18nCoverageConfigSchema = z.object({
  minimumPercent: z.number().min(0).max(100).default(100),
  requirePlurals: z.boolean().default(true),
  detectUntranslated: z.boolean().default(true),
});

export const I18nMcpConfigSchema = z.object({
  server: z.string(),
  projectId: z.string().optional(),
});

export const I18nConfigSchema = z.object({
  enabled: z.boolean().default(false),
  strictness: z.enum(['strict', 'standard', 'permissive']).default('standard'),
  sourceLocale: z.string().default('en'),
  targetLocales: z.array(z.string()).default([]),
  framework: z
    .enum([
      'auto',
      'i18next',
      'react-intl',
      'vue-i18n',
      'flutter-intl',
      'apple',
      'android',
      'custom',
    ])
    .default('auto'),
  format: z.string().default('json'),
  messageFormat: z.enum(['icu', 'i18next', 'custom']).default('icu'),
  keyConvention: z
    .enum(['dot-notation', 'snake_case', 'camelCase', 'custom'])
    .default('dot-notation'),
  translationPaths: z.record(z.string(), z.string()).optional(),
  platforms: z.array(z.enum(['web', 'mobile', 'backend'])).default([]),
  industry: z.string().optional(),
  coverage: I18nCoverageConfigSchema.optional(),
  pseudoLocale: z.string().optional(),
  mcp: I18nMcpConfigSchema.optional(),
});

export const ModelTierConfigSchema = z.object({
  fast: z.string().optional(),
  standard: z.string().optional(),
  strong: z.string().optional(),
});

export const ReviewConfigSchema = z.object({
  model_tiers: ModelTierConfigSchema.optional(),
});

export const HarnessConfigSchema = z.object({
  version: z.literal(1),
  name: z.string().optional(),
  rootDir: z.string().default('.'),
  layers: z.array(LayerSchema).optional(),
  forbiddenImports: z.array(ForbiddenImportSchema).optional(),
  boundaries: BoundaryConfigSchema.optional(),
  agentsMapPath: z.string().default('./AGENTS.md'),
  docsDir: z.string().default('./docs'),
  agent: AgentConfigSchema.optional(),
  entropy: EntropyConfigSchema.optional(),
  security: SecurityConfigSchema.optional(),
  performance: PerformanceConfigSchema.optional(),
  template: z
    .object({
      level: z.enum(['basic', 'intermediate', 'advanced']),
      framework: z.string().optional(),
      version: z.number(),
    })
    .optional(),
  phaseGates: PhaseGatesConfigSchema.optional(),
  design: DesignConfigSchema.optional(),
  i18n: I18nConfigSchema.optional(),
  review: ReviewConfigSchema.optional(),
  updateCheckInterval: z.number().int().min(0).optional(),
});

export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;
export type DesignConfig = z.infer<typeof DesignConfigSchema>;
export type I18nConfig = z.infer<typeof I18nConfigSchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type ReviewConfig = z.infer<typeof ReviewConfigSchema>;
export type ModelTierConfigZod = z.infer<typeof ModelTierConfigSchema>;
