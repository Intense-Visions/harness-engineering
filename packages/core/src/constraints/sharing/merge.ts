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

type LayerEntry = { name: string; pattern: string; allowedDependencies: string[] };
type ForbiddenImportEntry = { from: string; disallow: string[]; message?: string };

function mergeLayers(
  localConfig: Record<string, unknown>,
  bundleLayers: LayerEntry[],
  config: Record<string, unknown>,
  contributions: Contributions,
  conflicts: ConflictReport[]
): void {
  const localLayers = (Array.isArray(localConfig.layers) ? localConfig.layers : []) as LayerEntry[];
  const mergedLayers = [...localLayers];
  const contributedLayerNames: string[] = [];

  for (const bundleLayer of bundleLayers) {
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
    }
  }

  config.layers = mergedLayers;
  if (contributedLayerNames.length > 0) contributions.layers = contributedLayerNames;
}

function mergeForbiddenImports(
  localConfig: Record<string, unknown>,
  bundleRules: ForbiddenImportEntry[],
  config: Record<string, unknown>,
  contributions: Contributions,
  conflicts: ConflictReport[]
): void {
  const localFI = (
    Array.isArray(localConfig.forbiddenImports) ? localConfig.forbiddenImports : []
  ) as ForbiddenImportEntry[];
  const mergedFI = [...localFI];
  const contributedFromKeys: string[] = [];

  for (const bundleRule of bundleRules) {
    const existing = localFI.find((r) => r.from === bundleRule.from);
    if (!existing) {
      const entry: ForbiddenImportEntry = { from: bundleRule.from, disallow: bundleRule.disallow };
      if (bundleRule.message !== undefined) entry.message = bundleRule.message;
      mergedFI.push(entry);
      contributedFromKeys.push(bundleRule.from);
    } else {
      if (!stringArraysEqual(existing.disallow, bundleRule.disallow)) {
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
  if (contributedFromKeys.length > 0) contributions.forbiddenImports = contributedFromKeys;
}

function mergeBoundaries(
  localConfig: Record<string, unknown>,
  bundleBoundaries: { requireSchema?: string[] },
  config: Record<string, unknown>,
  contributions: Contributions
): void {
  const localBoundaries = (localConfig.boundaries ?? { requireSchema: [] }) as {
    requireSchema: string[];
  };
  const localSchemas = new Set(localBoundaries.requireSchema ?? []);
  const newSchemas: string[] = [];

  for (const schema of bundleBoundaries.requireSchema ?? []) {
    if (!localSchemas.has(schema)) {
      newSchemas.push(schema);
      localSchemas.add(schema);
    }
  }

  config.boundaries = { requireSchema: [...(localBoundaries.requireSchema ?? []), ...newSchemas] };
  if (newSchemas.length > 0) contributions.boundaries = newSchemas;
}

function mergeArchitecture(
  localConfig: Record<string, unknown>,
  bundleArch: {
    thresholds?: Record<string, unknown>;
    modules?: Record<string, Record<string, unknown>>;
  },
  config: Record<string, unknown>,
  contributions: Contributions,
  conflicts: ConflictReport[]
): void {
  const localArch = (localConfig.architecture ?? { thresholds: {}, modules: {} }) as {
    thresholds: Record<string, unknown>;
    modules: Record<string, Record<string, unknown>>;
    [key: string]: unknown;
  };

  const mergedThresholds = { ...localArch.thresholds };
  const contributedThresholdKeys: string[] = [];

  for (const [category, value] of Object.entries(bundleArch.thresholds ?? {})) {
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

  const mergedModules = { ...localArch.modules };
  const contributedModuleKeys: string[] = [];

  for (const [modulePath, bundleCategoryMap] of Object.entries(bundleArch.modules ?? {})) {
    if (!(modulePath in mergedModules)) {
      mergedModules[modulePath] = bundleCategoryMap;
      for (const cat of Object.keys(bundleCategoryMap))
        contributedModuleKeys.push(`${modulePath}:${cat}`);
    } else {
      const mergedCategoryMap = { ...mergedModules[modulePath] };
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

  config.architecture = { ...localArch, thresholds: mergedThresholds, modules: mergedModules };
  if (contributedThresholdKeys.length > 0)
    contributions['architecture.thresholds'] = contributedThresholdKeys;
  if (contributedModuleKeys.length > 0)
    contributions['architecture.modules'] = contributedModuleKeys;
}

function mergeSecurityRules(
  localConfig: Record<string, unknown>,
  bundleRules: Record<string, string>,
  config: Record<string, unknown>,
  contributions: Contributions,
  conflicts: ConflictReport[]
): void {
  const localSecurity = (localConfig.security ?? { rules: {} }) as {
    rules?: Record<string, string>;
  };
  const localRules = localSecurity.rules ?? {};
  const mergedRules = { ...localRules };
  const contributedRuleIds: string[] = [];

  for (const [ruleId, severity] of Object.entries(bundleRules)) {
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
  if (contributedRuleIds.length > 0) contributions['security.rules'] = contributedRuleIds;
}

export function deepMergeConstraints(
  localConfig: Record<string, unknown>,
  bundleConstraints: BundleConstraints,
  _existingContributions?: Contributions
): MergeResult {
  const config: Record<string, unknown> = { ...localConfig };
  const contributions: Contributions = {};
  const conflicts: ConflictReport[] = [];

  if (bundleConstraints.layers && bundleConstraints.layers.length > 0) {
    mergeLayers(localConfig, bundleConstraints.layers, config, contributions, conflicts);
  }

  if (bundleConstraints.forbiddenImports && bundleConstraints.forbiddenImports.length > 0) {
    mergeForbiddenImports(
      localConfig,
      bundleConstraints.forbiddenImports as ForbiddenImportEntry[],
      config,
      contributions,
      conflicts
    );
  }

  if (bundleConstraints.boundaries) {
    mergeBoundaries(
      localConfig,
      bundleConstraints.boundaries as { requireSchema?: string[] },
      config,
      contributions
    );
  }

  if (bundleConstraints.architecture) {
    mergeArchitecture(
      localConfig,
      bundleConstraints.architecture as {
        thresholds?: Record<string, unknown>;
        modules?: Record<string, Record<string, unknown>>;
      },
      config,
      contributions,
      conflicts
    );
  }

  if (bundleConstraints.security?.rules) {
    mergeSecurityRules(
      localConfig,
      bundleConstraints.security.rules as Record<string, string>,
      config,
      contributions,
      conflicts
    );
  }

  return { config, contributions, conflicts };
}
