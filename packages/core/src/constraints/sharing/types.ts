import { z } from 'zod';

// --- Manifest ---

export const ManifestSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  include: z.array(z.string()).min(1),
  minHarnessVersion: z.string().optional(),
  keywords: z.array(z.string()).optional().default([]),
  layers: z.record(z.array(z.string())).optional(),
  boundaries: z
    .array(
      z.object({
        name: z.string(),
        layer: z.string(),
        direction: z.enum(['input', 'output']),
        schema: z.string(),
      })
    )
    .optional(),
});

export type Manifest = z.infer<typeof ManifestSchema>;

// --- Bundle ---

export const BundleConstraintsSchema = z.object({
  layers: z
    .array(
      z.object({
        name: z.string(),
        pattern: z.string(),
        allowedDependencies: z.array(z.string()),
      })
    )
    .optional(),
  forbiddenImports: z
    .array(
      z.object({
        from: z.string(),
        disallow: z.array(z.string()),
        message: z.string().optional(),
      })
    )
    .optional(),
  boundaries: z
    .object({
      requireSchema: z.array(z.string()).optional(),
    })
    .optional(),
  architecture: z
    .object({
      thresholds: z.record(z.unknown()).optional(),
      modules: z.record(z.record(z.unknown())).optional(),
    })
    .optional(),
  security: z
    .object({
      rules: z.record(z.string()).optional(),
    })
    .optional(),
});

export const BundleSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  minHarnessVersion: z.string().optional(),
  manifest: ManifestSchema,
  constraints: BundleConstraintsSchema,
  contributions: z.record(z.unknown()).optional(),
});

export const ContributionsSchema = z.record(z.unknown());

export type Bundle = z.infer<typeof BundleSchema>;
export type BundleConstraints = z.infer<typeof BundleConstraintsSchema>;
export type Contributions = Record<string, unknown>;

// --- Lockfile ---

export const LockfilePackageSchema = z.object({
  version: z.string(),
  source: z.string(),
  installedAt: z.string(),
  contributions: z.record(z.unknown()).optional().nullable(),
  resolved: z.string().optional(),
  integrity: z.string().optional(),
  provenance: z.array(z.string()).optional(),
});

export const LockfileSchema = z
  .object({
    version: z.literal(1).optional(), // Used by some tests
    lockfileVersion: z.literal(1).optional(), // Standard field
    packages: z.record(LockfilePackageSchema),
  })
  .refine((data) => data.version !== undefined || data.lockfileVersion !== undefined, {
    message: "Either 'version' or 'lockfileVersion' must be present and equal to 1",
  });

export type Lockfile = z.infer<typeof LockfileSchema>;
export type LockfilePackage = z.infer<typeof LockfilePackageSchema>;

// Shared Layer Schemas (referenced in index.ts)
export const SharableLayerSchema = z.unknown();
export const SharableForbiddenImportSchema = z.unknown();
export const SharableBoundaryConfigSchema = z.unknown();
export const SharableSecurityRulesSchema = z.unknown();
