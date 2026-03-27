import { z } from 'zod';

export const LanguageEnum = z.enum(['typescript', 'python', 'go', 'rust', 'java']);

export const ToolingSchema = z.object({
  packageManager: z.string().optional(),
  linter: z.string().optional(),
  formatter: z.string().optional(),
  buildTool: z.string().optional(),
  testRunner: z.string().optional(),
  lockFile: z.string().optional(),
});

export const DetectPatternSchema = z.object({
  file: z.string(),
  contains: z.string().optional(),
});

export const MergeStrategySchema = z.object({
  json: z.enum(['deep-merge', 'overlay-wins']).default('deep-merge'),
  files: z.literal('overlay-wins').default('overlay-wins'),
});

export const TemplateMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  level: z.enum(['basic', 'intermediate', 'advanced']).optional(),
  framework: z.string().optional(),
  extends: z.string().optional(),
  mergeStrategy: MergeStrategySchema.default({}),
  version: z.literal(1),
  language: LanguageEnum.optional(),
  tooling: ToolingSchema.optional(),
  detect: z.array(DetectPatternSchema).optional(),
});

export type TemplateMetadata = z.infer<typeof TemplateMetadataSchema>;
export type MergeStrategy = z.infer<typeof MergeStrategySchema>;
export type Tooling = z.infer<typeof ToolingSchema>;
export type DetectPattern = z.infer<typeof DetectPatternSchema>;
export type Language = z.infer<typeof LanguageEnum>;
