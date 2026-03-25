import type { Contributions } from './types';

/**
 * Remove contributions from a config object.
 *
 * Uses the contributions record (as stored in the lockfile) to identify
 * exactly which rules/layers/thresholds to remove from each section.
 *
 * Returns a new config object; does not mutate the input.
 */
export function removeContributions(
  config: Record<string, unknown>,
  contributions: Contributions
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...config };

  // --- Layers ---
  const layerNames = contributions.layers as string[] | undefined;
  if (layerNames && layerNames.length > 0 && Array.isArray(result.layers)) {
    const nameSet = new Set(layerNames);
    result.layers = (result.layers as Array<{ name: string }>).filter((l) => !nameSet.has(l.name));
  }

  // --- Forbidden Imports ---
  const fromKeys = contributions.forbiddenImports as string[] | undefined;
  if (fromKeys && fromKeys.length > 0 && Array.isArray(result.forbiddenImports)) {
    const fromSet = new Set(fromKeys);
    result.forbiddenImports = (result.forbiddenImports as Array<{ from: string }>).filter(
      (r) => !fromSet.has(r.from)
    );
  }

  // --- Boundaries ---
  const boundarySchemas = contributions.boundaries as string[] | undefined;
  if (boundarySchemas && boundarySchemas.length > 0 && result.boundaries) {
    const boundaries = result.boundaries as { requireSchema?: string[] };
    if (boundaries.requireSchema) {
      const schemaSet = new Set(boundarySchemas);
      result.boundaries = {
        ...boundaries,
        requireSchema: boundaries.requireSchema.filter((s) => !schemaSet.has(s)),
      };
    }
  }

  // --- Architecture Thresholds ---
  const thresholdKeys = contributions['architecture.thresholds'] as string[] | undefined;
  if (thresholdKeys && thresholdKeys.length > 0 && result.architecture) {
    const arch = { ...(result.architecture as Record<string, unknown>) };
    const thresholds = { ...(arch.thresholds as Record<string, unknown>) };
    for (const key of thresholdKeys) {
      delete thresholds[key];
    }
    arch.thresholds = thresholds;
    result.architecture = arch;
  }

  // --- Architecture Modules ---
  const moduleKeys = contributions['architecture.modules'] as string[] | undefined;
  if (moduleKeys && moduleKeys.length > 0 && result.architecture) {
    const arch = { ...(result.architecture as Record<string, unknown>) };
    const modules = { ...(arch.modules as Record<string, Record<string, unknown>>) };
    for (const key of moduleKeys) {
      const colonIdx = key.indexOf(':');
      if (colonIdx === -1) continue;
      const modulePath = key.substring(0, colonIdx);
      const category = key.substring(colonIdx + 1);
      if (modules[modulePath]) {
        const moduleCategories = { ...modules[modulePath] };
        delete moduleCategories[category];
        if (Object.keys(moduleCategories).length === 0) {
          delete modules[modulePath];
        } else {
          modules[modulePath] = moduleCategories;
        }
      }
    }
    arch.modules = modules;
    result.architecture = arch;
  }

  // --- Security Rules ---
  const ruleIds = contributions['security.rules'] as string[] | undefined;
  if (ruleIds && ruleIds.length > 0 && result.security) {
    const security = { ...(result.security as Record<string, unknown>) };
    const rules = { ...(security.rules as Record<string, string>) };
    for (const id of ruleIds) {
      delete rules[id];
    }
    security.rules = rules;
    result.security = security;
  }

  return result;
}
