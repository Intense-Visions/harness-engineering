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
  template: z
    .object({
      level: z.enum(['basic', 'intermediate', 'advanced']),
      framework: z.string().optional(),
      version: z.number(),
    })
    .optional(),
  phaseGates: PhaseGatesConfigSchema.optional(),
});

export type HarnessConfig = z.infer<typeof HarnessConfigSchema>;
export type Layer = z.infer<typeof LayerSchema>;
