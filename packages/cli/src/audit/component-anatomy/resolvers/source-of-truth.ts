/**
 * Source-of-truth resolver — implements Decision #1 (proposal.md).
 *
 * Three-layer stack (mirrors component-type resolver — Decision #3):
 *   1. JSDoc `@anatomy-*` self-declaration tags. STUB pending JSDoc parser.
 *   2. DESIGN.md `## Component Anatomy Overrides` per-component override.
 *      STUB pending DESIGN.md parser.
 *   3. Built-in convention catalog lookup.
 *
 * Returns the resolved ConventionRule (or null when no convention is
 * available for the type — silent skip per Decision #1).
 */

import type { ConventionRule } from '../rules/convention-rule.js';
import { buttonConvention } from '../catalog/conventions/button.js';

/**
 * Phase-1-vertical-slice catalog. Phase 2 expansion will replace this
 * inline map with a generated index that mirrors every convention file
 * under `catalog/conventions/`.
 */
const conventionCatalog: Record<string, ConventionRule> = {
  [buttonConvention.componentType]: buttonConvention,
};

/**
 * Resolve the active anatomy rules for a component.
 *
 * @param filePath      Project-relative file path.
 * @param fileContents  Raw source contents.
 * @param componentType Resolved component type (output of
 *                      `resolveComponentType`). When null, this function
 *                      cannot find a rule and returns null directly.
 */
export function resolveAnatomyRules(
  filePath: string,
  fileContents: string,
  componentType: string | null
): ConventionRule | null {
  if (componentType === null) return null;

  // Layer 1: JSDoc @anatomy-* tags (STUB — pending JSDoc parser task).
  const jsdocRule = resolveFromJSDoc(filePath, fileContents, componentType);
  if (jsdocRule !== null) return jsdocRule;

  // Layer 2: DESIGN.md overrides (STUB — pending DESIGN.md parser task).
  const overrideRule = resolveFromDesignOverrides(filePath, componentType);
  if (overrideRule !== null) return overrideRule;

  // Layer 3: built-in catalog lookup.
  return conventionCatalog[componentType] ?? null;
}

/** STUB. Returns null until the JSDoc parser task lands. */
function resolveFromJSDoc(
  _filePath: string,
  _fileContents: string,
  _componentType: string
): ConventionRule | null {
  return null;
}

/** STUB. Returns null until the DESIGN.md parser task lands. */
function resolveFromDesignOverrides(
  _filePath: string,
  _componentType: string
): ConventionRule | null {
  return null;
}
