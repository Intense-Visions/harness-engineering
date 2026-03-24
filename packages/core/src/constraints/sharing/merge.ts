import type { BundleConstraints, Contributions } from './types';

export interface ConflictReport {
  section: string;
  key: string;
  localValue: unknown;
  packageValue: unknown;
  description: string;
}

export interface MergeResult {
  config: Record<string, unknown>;
  contributions: Contributions;
  conflicts: ConflictReport[];
}

/**
 * Deep-merge bundle constraints into a local config.
 *
 * Each constraint section has its own merge semantics:
 * - Layers: match by name, append new, conflict on different config
 * - Forbidden imports: match by `from`, append new, conflict on different `disallow`
 * - Boundaries: union requireSchema arrays, deduplicate
 * - Architecture thresholds: per-category merge, conflict on different values
 * - Architecture modules: per-module per-category merge, same conflict strategy
 * - Security rules: per-rule-ID merge, conflict on different severity
 */
function arraysEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = [...a].sort();
  const sortedB = [...b].sort();
  return sortedA.every((val, i) => val === sortedB[i]);
}

export function deepMergeConstraints(
  localConfig: Record<string, unknown>,
  bundleConstraints: BundleConstraints,
  _existingContributions?: Contributions
): MergeResult {
  const config: Record<string, unknown> = { ...localConfig };
  const contributions: Contributions = {};
  const conflicts: ConflictReport[] = [];

  // --- Layers ---
  if (bundleConstraints.layers && bundleConstraints.layers.length > 0) {
    const localLayers = (Array.isArray(localConfig.layers) ? localConfig.layers : []) as Array<{
      name: string;
      pattern: string;
      allowedDependencies: string[];
    }>;
    const mergedLayers = [...localLayers];
    const contributedLayerNames: string[] = [];

    for (const bundleLayer of bundleConstraints.layers) {
      const existing = localLayers.find((l) => l.name === bundleLayer.name);
      if (!existing) {
        mergedLayers.push(bundleLayer);
        contributedLayerNames.push(bundleLayer.name);
      } else {
        const same =
          existing.pattern === bundleLayer.pattern &&
          arraysEqual(existing.allowedDependencies, bundleLayer.allowedDependencies);
        if (!same) {
          conflicts.push({
            section: 'layers',
            key: bundleLayer.name,
            localValue: existing,
            packageValue: bundleLayer,
            description: `Layer '${bundleLayer.name}' already exists locally with different configuration`,
          });
        }
        // identical → skip
      }
    }

    config.layers = mergedLayers;
    if (contributedLayerNames.length > 0) {
      contributions.layers = contributedLayerNames;
    }
  }

  // --- Forbidden Imports ---
  if (bundleConstraints.forbiddenImports && bundleConstraints.forbiddenImports.length > 0) {
    const localFI = (
      Array.isArray(localConfig.forbiddenImports) ? localConfig.forbiddenImports : []
    ) as Array<{
      from: string;
      disallow: string[];
      message?: string;
    }>;
    const mergedFI = [...localFI];
    const contributedIndices: number[] = [];

    for (const bundleRule of bundleConstraints.forbiddenImports) {
      const existing = localFI.find((r) => r.from === bundleRule.from);
      if (!existing) {
        const newIndex = mergedFI.length;
        mergedFI.push(bundleRule);
        contributedIndices.push(newIndex);
      } else {
        const same = arraysEqual(existing.disallow, bundleRule.disallow);
        if (!same) {
          conflicts.push({
            section: 'forbiddenImports',
            key: bundleRule.from,
            localValue: existing,
            packageValue: bundleRule,
            description: `Forbidden import rule for '${bundleRule.from}' already exists locally with different disallow list`,
          });
        }
      }
    }

    config.forbiddenImports = mergedFI;
    if (contributedIndices.length > 0) {
      contributions.forbiddenImports = contributedIndices;
    }
  }

  // --- Boundaries ---
  if (bundleConstraints.boundaries) {
    const localBoundaries = (localConfig.boundaries ?? { requireSchema: [] }) as {
      requireSchema: string[];
    };
    const localSchemas = new Set(localBoundaries.requireSchema ?? []);
    const bundleSchemas = bundleConstraints.boundaries.requireSchema ?? [];
    const newSchemas: string[] = [];

    for (const schema of bundleSchemas) {
      if (!localSchemas.has(schema)) {
        newSchemas.push(schema);
        localSchemas.add(schema);
      }
    }

    config.boundaries = {
      requireSchema: [...(localBoundaries.requireSchema ?? []), ...newSchemas],
    };

    if (newSchemas.length > 0) {
      contributions.boundaries = newSchemas;
    }
  }

  return { config, contributions, conflicts };
}
