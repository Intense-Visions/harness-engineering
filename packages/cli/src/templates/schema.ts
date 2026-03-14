import { z } from 'zod';

export const MergeStrategySchema = z.object({
  json: z.enum(['deep-merge', 'overlay-wins']).default('deep-merge'),
  files: z.enum(['overlay-wins', 'error']).default('overlay-wins'),
});

export const TemplateMetadataSchema = z.object({
  name: z.string(),
  description: z.string(),
  level: z.enum(['basic', 'intermediate', 'advanced']).optional(),
  framework: z.string().optional(),
  extends: z.string().optional(),
  mergeStrategy: MergeStrategySchema.default({}),
  version: z.literal(1),
});

export type TemplateMetadata = z.infer<typeof TemplateMetadataSchema>;
export type MergeStrategy = z.infer<typeof MergeStrategySchema>;
