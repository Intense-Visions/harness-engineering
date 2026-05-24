/**
 * Component-type resolver — implements Decision #3 (proposal.md).
 *
 * Three-layer stack:
 *   1. JSDoc `@component-type` tag (top of the file) — authoritative
 *      self-declaration. STUB in this MVP — returns null pending the
 *      JSDoc parser task.
 *   2. DESIGN.md `## Component Registry` section — explicit
 *      project-level mapping. STUB in this MVP — returns null pending
 *      the DESIGN.md parser task.
 *   3. Top-level export-name catalog match — `export const Button = ...`
 *      where `Button` is a key in the convention catalog. This is the
 *      implemented layer for the vertical slice; per Decision #3 it
 *      covers ~80% of well-organized React codebases.
 *
 * Resolution returns `null` (silent skip) when no layer matches — per
 * Decision #3 the audit deliberately does NOT guess.
 */

import { buttonConvention } from '../catalog/conventions/button.js';

/**
 * Phase-1-vertical-slice catalog. Phase 2 expansion will replace this
 * inline list with a generated index that mirrors every catalog file
 * under `catalog/conventions/`. The shape (`Record<componentType, ...>`)
 * is the durable contract — only the entries change.
 */
const componentTypeCatalog: Record<string, true> = {
  [buttonConvention.componentType]: true,
};

/**
 * Resolve a component type for a given file using the Decision #3
 * hybrid stack. Returns the type string when matched, `null` when no
 * layer matches.
 *
 * @param filePath     Project-relative path of the file under audit.
 * @param fileContents Raw source contents of the file.
 */
export function resolveComponentType(filePath: string, fileContents: string): string | null {
  // Layer 1: JSDoc @component-type tag (STUB — pending JSDoc parser task).
  const jsdocType = resolveFromJSDoc(filePath, fileContents);
  if (jsdocType !== null) return jsdocType;

  // Layer 2: DESIGN.md ## Component Registry (STUB — pending DESIGN.md parser task).
  const registryType = resolveFromDesignRegistry(filePath);
  if (registryType !== null) return registryType;

  // Layer 3: top-level export name match against the catalog.
  return resolveFromExportName(fileContents);
}

/** STUB. Returns null until the JSDoc parser task lands. */
function resolveFromJSDoc(_filePath: string, _fileContents: string): string | null {
  return null;
}

/** STUB. Returns null until the DESIGN.md parser task lands. */
function resolveFromDesignRegistry(_filePath: string): string | null {
  return null;
}

/**
 * Catalog match via the top-level export name. Recognises the two most
 * common React export shapes:
 *   - `export const Button = ...`
 *   - `export function Button(...) {...}`
 *   - `export default function Button() {...}`
 *   - `export default Button` (paired with a same-file declaration)
 *
 * Anything more elaborate (renamed exports, re-export barrels, etc.)
 * falls through to a `null` return — Decision #3 covers those cases via
 * the JSDoc tag or DESIGN.md registry layers above.
 */
function resolveFromExportName(fileContents: string): string | null {
  const patterns = [
    /\bexport\s+const\s+([A-Z][A-Za-z0-9_]*)\b/,
    /\bexport\s+function\s+([A-Z][A-Za-z0-9_]*)\s*\(/,
    /\bexport\s+default\s+function\s+([A-Z][A-Za-z0-9_]*)\s*\(/,
    /\bexport\s+default\s+([A-Z][A-Za-z0-9_]*)\s*;?\s*$/m,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(fileContents);
    const name = match?.[1];
    if (name && componentTypeCatalog[name]) {
      return name;
    }
  }
  return null;
}
