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
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => deepEqual(val, b[i]));
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((key) =>
    deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}

/** Order-insensitive equality for string arrays (e.g. allowedDependencies, disallow). */
function stringArraysEqual(a: string[], b: string[]): boolean {
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
          stringArraysEqual(existing.allowedDependencies, bundleLayer.allowedDependencies);
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
    const contributedFromKeys: string[] = [];

    for (const bundleRule of bundleConstraints.forbiddenImports) {
      const existing = localFI.find((r) => r.from === bundleRule.from);
      if (!existing) {
        const entry: { from: string; disallow: string[]; message?: string } = {
          from: bundleRule.from,
          disallow: bundleRule.disallow,
        };
        if (bundleRule.message !== undefined) {
          entry.message = bundleRule.message;
        }
        mergedFI.push(entry);
        contributedFromKeys.push(bundleRule.from);
      } else {
        const same = stringArraysEqual(existing.disallow, bundleRule.disallow);
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
    if (contributedFromKeys.length > 0) {
      contributions.forbiddenImports = contributedFromKeys;
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

  // --- Architecture ---
  if (bundleConstraints.architecture) {
    const localArch = (localConfig.architecture ?? {
      enabled: true,
      baselinePath: '.harness/arch/baselines.json',
      thresholds: {},
      modules: {},
    }) as {
      enabled: boolean;
      baselinePath: string;
      thresholds: Record<string, unknown>;
      modules: Record<string, Record<string, unknown>>;
    };

    const mergedThresholds = { ...localArch.thresholds };
    const contributedThresholdKeys: string[] = [];

    const bundleThresholds = bundleConstraints.architecture.thresholds ?? {};
    for (const [category, value] of Object.entries(bundleThresholds)) {
      if (!(category in mergedThresholds)) {
        mergedThresholds[category] = value;
        contributedThresholdKeys.push(category);
      } else if (!deepEqual(mergedThresholds[category], value)) {
        conflicts.push({
          section: 'architecture.thresholds',
          key: category,
          localValue: mergedThresholds[category],
          packageValue: value,
          description: `Architecture threshold '${category}' already exists locally with a different value`,
        });
      }
    }

    // --- Architecture Modules ---
    const mergedModules = { ...localArch.modules };
    const contributedModuleKeys: string[] = [];

    const bundleModules = bundleConstraints.architecture.modules ?? {};
    for (const [modulePath, bundleCategoryMap] of Object.entries(bundleModules)) {
      if (!(modulePath in mergedModules)) {
        mergedModules[modulePath] = bundleCategoryMap;
        for (const cat of Object.keys(bundleCategoryMap)) {
          contributedModuleKeys.push(`${modulePath}:${cat}`);
        }
      } else {
        const localCategoryMap = mergedModules[modulePath];
        const mergedCategoryMap = { ...localCategoryMap };
        for (const [category, value] of Object.entries(bundleCategoryMap)) {
          if (!(category in mergedCategoryMap)) {
            mergedCategoryMap[category] = value;
            contributedModuleKeys.push(`${modulePath}:${category}`);
          } else if (!deepEqual(mergedCategoryMap[category], value)) {
            conflicts.push({
              section: 'architecture.modules',
              key: `${modulePath}:${category}`,
              localValue: mergedCategoryMap[category],
              packageValue: value,
              description: `Architecture module override '${modulePath}' category '${category}' already exists locally with a different value`,
            });
          }
        }
        mergedModules[modulePath] = mergedCategoryMap;
      }
    }

    config.architecture = {
      ...localArch,
      thresholds: mergedThresholds,
      modules: mergedModules,
    };

    if (contributedThresholdKeys.length > 0) {
      contributions['architecture.thresholds'] = contributedThresholdKeys;
    }
    if (contributedModuleKeys.length > 0) {
      contributions['architecture.modules'] = contributedModuleKeys;
    }
  }

  // --- Security Rules ---
  if (bundleConstraints.security?.rules) {
    const localSecurity = (localConfig.security ?? { rules: {} }) as {
      rules?: Record<string, string>;
    };
    const localRules = localSecurity.rules ?? {};
    const mergedRules = { ...localRules };
    const contributedRuleIds: string[] = [];

    for (const [ruleId, severity] of Object.entries(bundleConstraints.security.rules)) {
      if (!(ruleId in mergedRules)) {
        mergedRules[ruleId] = severity;
        contributedRuleIds.push(ruleId);
      } else if (mergedRules[ruleId] !== severity) {
        conflicts.push({
          section: 'security.rules',
          key: ruleId,
          localValue: mergedRules[ruleId],
          packageValue: severity,
          description: `Security rule '${ruleId}' already exists locally with severity '${mergedRules[ruleId]}', bundle has '${severity}'`,
        });
      }
    }

    config.security = { ...localSecurity, rules: mergedRules };

    if (contributedRuleIds.length > 0) {
      contributions['security.rules'] = contributedRuleIds;
    }
  }

  return { config, contributions, conflicts };
}
