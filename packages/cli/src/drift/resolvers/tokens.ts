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
    collectPathInto(node, breadcrumb, idx);
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      walkForPaths(value as Record<string, unknown>, [...breadcrumb, key], idx);
    }
  }
}

function collectPathInto(
  node: Record<string, unknown>,
  breadcrumb: string[],
  idx: TokenPathIndex
): void {
  const tokenPath = breadcrumb.join('.');
  const $type = typeof node.$type === 'string' ? (node.$type as string) : undefined;
  const $value = node.$value;
  const parts = classifyTokenValue($type, $value);
  for (const c of parts.colors) pushPath(idx.colorPath, c, tokenPath);
  for (const f of parts.fontFamilies) pushPath(idx.fontFamilyPath, f, tokenPath);
  for (const px of parts.spacingPx) pushPath(idx.spacingPath, px, tokenPath);
}

function pushPath<K>(map: Map<K, string[]>, key: K, path: string): void {
  const list = map.get(key) ?? [];
  list.push(path);
  map.set(key, list);
}

function walk(node: Record<string, unknown>, breadcrumb: string[], set: TokenSet): void {
  // A DTCG token has a $value field. If present, this object is a token, not a group.
  if ('$value' in node) {
    collectTokenInto(node, breadcrumb, set);
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

function collectTokenInto(
  node: Record<string, unknown>,
  breadcrumb: string[],
  set: TokenSet
): void {
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

  const parts = classifyTokenValue($type, $value);
  for (const c of parts.colors) set.colors.add(c);
  for (const f of parts.fontFamilies) set.fontFamilies.add(f);
  for (const px of parts.spacingPx) set.spacingPx.add(px);
}

/**
 * Classified, value-equivalent token contributions for a DTCG token's
 * ($type, $value) pair. Each category is gated on a distinct $type, so the
 * per-category helpers are a mechanical equivalent of the original mutually
 * exclusive if/else-if chain shared by both walkers.
 */
interface TokenValueParts {
  colors: string[];
  fontFamilies: string[];
  spacingPx: number[];
}

function classifyTokenValue($type: string | undefined, $value: unknown): TokenValueParts {
  return {
    colors: colorValues($type, $value),
    fontFamilies: fontFamilyValues($type, $value),
    spacingPx: spacingValues($type, $value),
  };
}

function colorValues($type: string | undefined, $value: unknown): string[] {
  if ($type === 'color' && typeof $value === 'string') return [$value.toLowerCase()];
  return [];
}

function fontFamilyValues($type: string | undefined, $value: unknown): string[] {
  if ($type !== 'fontFamily') return [];
  if (typeof $value === 'string') return [$value.toLowerCase()];
  if (Array.isArray($value)) {
    return $value.filter((f): f is string => typeof f === 'string').map((f) => f.toLowerCase());
  }
  return [];
}

function spacingValues($type: string | undefined, $value: unknown): number[] {
  if ($type !== 'dimension' && $type !== 'spacing') return [];
  if (typeof $value === 'string') {
    const px = parsePxValue($value);
    return px !== null ? [px] : [];
  }
  if (typeof $value === 'number') return [$value];
  return [];
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
