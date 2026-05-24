/**
 * Load and parse design-system/tokens.json (W3C DTCG format).
 *
 * Extracts:
 *   - Color values (palette)
 *   - Font-family values
 *   - Spacing-scale values (px equivalents)
 *   - Deprecated token paths (any token with $deprecated: true OR
 *     $extensions.harness.deprecated: true)
 *
 * Returns null when tokens.json is absent — token bypass checks then
 * skip silently. Returns an empty TokenSet when tokens.json exists but
 * has no design tokens (rare; project is mid-bootstrap).
 *
 * Source: docs/changes/design-pipeline/detect-design-drift/proposal.md
 *   (Inputs → tokens.json).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface TokenSet {
  /** Lowercased hex color values from $type: 'color' tokens */
  colors: Set<string>;
  /** Lowercased font-family strings from $type: 'fontFamily' or typography token primary family */
  fontFamilies: Set<string>;
  /** Numeric pixel values from $type: 'dimension' / 'spacing' tokens */
  spacingPx: Set<number>;
  /** Token paths flagged as deprecated (dotted: "color.brand.500") */
  deprecatedTokens: Set<string>;
}

/**
 * Path-keyed index of token values — consumed by align-design-system's
 * pre-flight classifier and codemods. Built by the same walk as TokenSet
 * but indexed by value → path[] so callers can resolve a hex / family /
 * px value back to the dotted token path needed to write a token reference.
 */
export interface TokenPathIndex {
  /** Lowercased hex → token paths */
  colorPath: Map<string, string[]>;
  /** Lowercased font-family → token paths */
  fontFamilyPath: Map<string, string[]>;
  /** Px value → token paths */
  spacingPath: Map<number, string[]>;
}

/**
 * Attempt to load tokens.json from a project. Returns null when the
 * file doesn't exist.
 */
export function loadTokenSet(projectRoot: string): TokenSet | null {
  const tokenPath = path.join(projectRoot, 'design-system', 'tokens.json');
  if (!fs.existsSync(tokenPath)) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(tokenPath, 'utf-8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  return extractTokens(parsed as Record<string, unknown>);
}

function extractTokens(root: Record<string, unknown>): TokenSet {
  const set: TokenSet = {
    colors: new Set(),
    fontFamilies: new Set(),
    spacingPx: new Set(),
    deprecatedTokens: new Set(),
  };
  walk(root, [], set);
  return set;
}

/**
 * Load a path-keyed index from tokens.json — sibling to loadTokenSet.
 * Returns null when the file is absent (callers then degrade like
 * tokens absence in the drift rules).
 */
export function loadTokenPathIndex(projectRoot: string): TokenPathIndex | null {
  const tokenPath = path.join(projectRoot, 'design-system', 'tokens.json');
  if (!fs.existsSync(tokenPath)) return null;
  let raw: string;
  try {
    raw = fs.readFileSync(tokenPath, 'utf-8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) return null;
  return extractPathIndex(parsed as Record<string, unknown>);
}

function extractPathIndex(root: Record<string, unknown>): TokenPathIndex {
  const idx: TokenPathIndex = {
    colorPath: new Map(),
    fontFamilyPath: new Map(),
    spacingPath: new Map(),
  };
  walkForPaths(root, [], idx);
  return idx;
}

function walkForPaths(
  node: Record<string, unknown>,
  breadcrumb: string[],
  idx: TokenPathIndex
): void {
  if ('$value' in node) {
    const tokenPath = breadcrumb.join('.');
    const $type = typeof node.$type === 'string' ? (node.$type as string) : undefined;
    const $value = node.$value;
    if ($type === 'color' && typeof $value === 'string') {
      pushPath(idx.colorPath, $value.toLowerCase(), tokenPath);
    } else if ($type === 'fontFamily' && typeof $value === 'string') {
      pushPath(idx.fontFamilyPath, $value.toLowerCase(), tokenPath);
    } else if ($type === 'fontFamily' && Array.isArray($value)) {
      for (const f of $value) {
        if (typeof f === 'string') pushPath(idx.fontFamilyPath, f.toLowerCase(), tokenPath);
      }
    } else if (($type === 'dimension' || $type === 'spacing') && typeof $value === 'string') {
      const px = parsePxValue($value);
      if (px !== null) pushPath(idx.spacingPath, px, tokenPath);
    } else if (($type === 'dimension' || $type === 'spacing') && typeof $value === 'number') {
      pushPath(idx.spacingPath, $value, tokenPath);
    }
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      walkForPaths(value as Record<string, unknown>, [...breadcrumb, key], idx);
    }
  }
}

function pushPath<K>(map: Map<K, string[]>, key: K, path: string): void {
  const list = map.get(key) ?? [];
  list.push(path);
  map.set(key, list);
}

function walk(node: Record<string, unknown>, breadcrumb: string[], set: TokenSet): void {
  // A DTCG token has a $value field. If present, this object is a token, not a group.
  if ('$value' in node) {
    const tokenPath = breadcrumb.join('.');
    const $type = typeof node.$type === 'string' ? (node.$type as string) : undefined;
    const $value = node.$value;

    // Deprecated detection: either standard $deprecated or harness extension.
    if (
      node.$deprecated === true ||
      isHarnessDeprecated(node.$extensions as Record<string, unknown> | undefined)
    ) {
      set.deprecatedTokens.add(tokenPath);
    }

    if ($type === 'color' && typeof $value === 'string') {
      set.colors.add($value.toLowerCase());
    } else if ($type === 'fontFamily' && typeof $value === 'string') {
      set.fontFamilies.add($value.toLowerCase());
    } else if ($type === 'fontFamily' && Array.isArray($value)) {
      for (const f of $value) {
        if (typeof f === 'string') set.fontFamilies.add(f.toLowerCase());
      }
    } else if (($type === 'dimension' || $type === 'spacing') && typeof $value === 'string') {
      const px = parsePxValue($value);
      if (px !== null) set.spacingPx.add(px);
    } else if (($type === 'dimension' || $type === 'spacing') && typeof $value === 'number') {
      set.spacingPx.add($value);
    }
    return;
  }

  // Group: recurse into children
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue; // DTCG metadata (description, extensions, etc.)
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      walk(value as Record<string, unknown>, [...breadcrumb, key], set);
    }
  }
}

function isHarnessDeprecated(extensions: Record<string, unknown> | undefined): boolean {
  if (!extensions || typeof extensions !== 'object') return false;
  const harness = extensions['harness'] as Record<string, unknown> | undefined;
  if (!harness || typeof harness !== 'object') return false;
  return harness.deprecated === true;
}

/**
 * Parse a CSS pixel value like "16px" → 16. Returns null for non-px
 * values (rem, em, %, etc.) so they're not in the spacing scale.
 */
function parsePxValue(s: string): number | null {
  const match = s.match(/^(\d+(?:\.\d+)?)px$/);
  if (!match) return null;
  return parseFloat(match[1]!);
}
