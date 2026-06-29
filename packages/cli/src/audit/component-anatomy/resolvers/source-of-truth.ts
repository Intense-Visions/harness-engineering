/**
 * Source-of-truth resolver — implements Decision #1 (proposal.md).
 *
 * Three-layer stack (mirrors component-type resolver — Decision #3):
 *   1. JSDoc `@anatomy-*` self-declaration tags.
 *   2. DESIGN.md `## Component Anatomy Overrides` per-component override.
 *   3. Built-in convention catalog lookup.
 *
 * Returns the resolved ConventionRule (or null when no convention is
 * available for the type — silent skip per Decision #1).
 */

import * as fs from 'node:fs';
import type { ConventionRule } from '../rules/convention-rule.js';
import { lookupConvention } from '../catalog/index.js';
import { extractLeadingJsDoc } from '../parsers/jsdoc.js';
import { buildAnatomyRuleFromJsDoc } from '../parsers/anatomy-tags.js';
import { findDesignMd } from '../parsers/design-registry.js';
import { parseAnatomyOverrides } from '../parsers/design-overrides.js';

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

  // Layer 1: the file's own `@anatomy-*` JSDoc self-declaration.
  const jsdocRule = resolveFromJSDoc(fileContents, componentType);
  if (jsdocRule !== null) return jsdocRule;

  // Layer 2: DESIGN.md `## Component Anatomy Overrides` for this type.
  const overrideRule = resolveFromDesignOverrides(filePath, componentType);
  if (overrideRule !== null) return overrideRule;

  // Layer 3: built-in catalog lookup via the central registry.
  return lookupConvention(componentType);
}

/** Layer 1: build a rule from the leading JSDoc block's `@anatomy-*` tags. */
function resolveFromJSDoc(fileContents: string, componentType: string): ConventionRule | null {
  const jsdoc = extractLeadingJsDoc(fileContents);
  if (jsdoc === null) return null;
  return buildAnatomyRuleFromJsDoc(jsdoc, componentType);
}

// Parsed `## Component Anatomy Overrides` keyed by DESIGN.md path — DESIGN.md is
// static for a process, so memoizing avoids re-reading it for every file.
const overridesCache = new Map<string, Map<string, ConventionRule>>();

/** Layer 2: look the component type up in the nearest DESIGN.md overrides. */
function resolveFromDesignOverrides(
  filePath: string,
  componentType: string
): ConventionRule | null {
  const designPath = findDesignMd(filePath);
  if (designPath === null) return null;

  let byType = overridesCache.get(designPath);
  if (!byType) {
    let contents: string;
    try {
      contents = fs.readFileSync(designPath, 'utf8');
    } catch {
      contents = '';
    }
    byType = parseAnatomyOverrides(contents);
    overridesCache.set(designPath, byType);
  }
  return byType.get(componentType) ?? null;
}
