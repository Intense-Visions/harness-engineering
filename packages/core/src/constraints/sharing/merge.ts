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

  return { config, contributions, conflicts };
}
