import { z } from 'zod';

/**
 * Layer definition for architectural boundaries
 */
export const LayerSchema = z.object({
  name: z.string(),
  pattern: z.string(),
  allowedDependencies: z.array(z.string()),
});

/**
 * Forbidden import rule
 */
export const ForbiddenImportSchema = z.object({
  from: z.string(),
  disallow: z.array(z.string()),
  message: z.string().optional(),
});

/**
 * Boundary validation config
 */
export const BoundaryConfigSchema = z.object({
  requireSchema: z.array(z.string()),
});

/**
 * Complete harness.config.json schema
 * Duplicated from @harness-engineering/cli to avoid circular dependency
 */
export const HarnessConfigSchema = z.object({
  version: z.literal(1),
  layers: z.array(LayerSchema).optional(),
  forbiddenImports: z.array(ForbiddenImportSchema).optional(),
  boundaries: BoundaryConfigSchema.optional(),
});

export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;
export type Layer = z.infer<typeof LayerSchema>;
export type ForbiddenImport = z.infer<typeof ForbiddenImportSchema>;
