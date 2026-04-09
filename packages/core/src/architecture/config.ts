import type { ArchConfig, ArchMetricCategory, ThresholdConfig } from './types';

/**
 * Resolve effective thresholds for a given scope.
 *
 * When scope is 'project' or has no matching module entry, returns
 * project-wide thresholds. Otherwise, merges project thresholds
 * with module-level overrides (module wins per-category).
 *
 * For object-valued thresholds (e.g. coupling: { maxFanIn, maxFanOut }),
 * performs a shallow merge at the category level:
 *   project { maxFanIn: 10, maxFanOut: 8 } + module { maxFanOut: 5 }
 *   => { maxFanIn: 10, maxFanOut: 5 }
 *
 * When either side is a scalar, the module value replaces the project
 * value entirely (no merge across scalar/object boundaries).
 */
/**
 * Merge a single threshold category: shallow-object merge when both sides are objects,
 * otherwise the module value replaces the project value entirely.
 */
function mergeThresholdCategory(
  projectValue: number | Record<string, number> | undefined,
  moduleValue: number | Record<string, number>
): number | Record<string, number> {
  if (
    projectValue !== undefined &&
    typeof projectValue === 'object' &&
    !Array.isArray(projectValue) &&
    typeof moduleValue === 'object' &&
    !Array.isArray(moduleValue)
  ) {
    return {
      ...(projectValue as Record<string, number>),
      ...(moduleValue as Record<string, number>),
    };
  }
  return moduleValue;
}

export function resolveThresholds(scope: string, config: ArchConfig): ThresholdConfig {
  const projectThresholds: ThresholdConfig = {};
  for (const [key, val] of Object.entries(config.thresholds)) {
    projectThresholds[key as ArchMetricCategory] =
      typeof val === 'object' && val !== null && !Array.isArray(val) ? { ...val } : val;
  }

  // 'project' scope or no module match — return project-wide thresholds
  if (scope === 'project') {
    return projectThresholds;
  }

  const moduleOverrides = config.modules[scope];
  if (!moduleOverrides) {
    return projectThresholds;
  }

  // Merge: module overrides win per-category
  const merged: ThresholdConfig = { ...projectThresholds };

  for (const [category, moduleValue] of Object.entries(moduleOverrides)) {
    const projectValue = projectThresholds[category as keyof ThresholdConfig];
    merged[category as keyof ThresholdConfig] = mergeThresholdCategory(projectValue, moduleValue);
  }

  return merged;
}
