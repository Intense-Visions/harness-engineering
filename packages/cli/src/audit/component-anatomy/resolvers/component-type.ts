/**
 * Component-type resolver — implements Decision #3 (proposal.md).
 *
 * Three-layer stack:
 *   1. JSDoc `@component-type` tag (top of the file) — authoritative
 *      self-declaration, read from the leading doc block.
 *   2. DESIGN.md `## Component Registry` section — explicit
 *      project-level Type→File mapping (nearest DESIGN.md up the tree).
 *   3. Top-level export-name catalog match — `export const Button = ...`
 *      where `Button` is a key in the convention catalog. Per Decision #3
 *      it covers ~80% of well-organized React codebases.
 *
 * Resolution returns `null` (silent skip) when no layer matches — per
 * Decision #3 the audit deliberately does NOT guess.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getCatalogTypes } from '../catalog/index.js';
import { extractLeadingJsDoc, readJsDocTagValue } from '../parsers/jsdoc.js';
import { parseComponentRegistry, findDesignMd } from '../parsers/design-registry.js';

/**
 * Catalog of recognised component types, lazily materialised from the
 * central registry. Memoised at module level — the catalog content is
 * static for the duration of a process (entries added at module load,
 * never at runtime), so a one-shot computation is correct and avoids
 * paying the lookup cost on every resolve call.
 */
const componentTypeSet: Set<string> = new Set(getCatalogTypes());

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

/**
 * Layer 1: the file's leading JSDoc `@component-type <Type>` self-declaration.
 * Authoritative when present — returned verbatim (the author owns it); if the
 * declared type has no convention, the downstream rule resolver skips silently.
 */
function resolveFromJSDoc(_filePath: string, fileContents: string): string | null {
  const jsdoc = extractLeadingJsDoc(fileContents);
  if (jsdoc === null) return null;
  return readJsDocTagValue(jsdoc, 'component-type');
}

// Parsed `## Component Registry` rows keyed by the DESIGN.md path that produced
// them — DESIGN.md is static for a process, so memoizing avoids re-reading and
// re-parsing it on every audited file.
const registryCache = new Map<string, Map<string, string>>();

/**
 * Layer 2: the nearest DESIGN.md `## Component Registry` table. Maps the audited
 * file (matched by its registry `File` path, resolved relative to DESIGN.md's
 * directory) to its declared `Type`.
 */
function resolveFromDesignRegistry(filePath: string): string | null {
  const designPath = findDesignMd(filePath);
  if (designPath === null) return null;

  let byFile = registryCache.get(designPath);
  if (!byFile) {
    byFile = new Map();
    let contents: string;
    try {
      contents = fs.readFileSync(designPath, 'utf8');
    } catch {
      contents = '';
    }
    const designDir = path.dirname(designPath);
    for (const entry of parseComponentRegistry(contents)) {
      byFile.set(path.resolve(designDir, entry.file), entry.type);
    }
    registryCache.set(designPath, byFile);
  }
  return byFile.get(path.resolve(filePath)) ?? null;
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
    if (name && componentTypeSet.has(name)) {
      return name;
    }
  }
  return null;
}
