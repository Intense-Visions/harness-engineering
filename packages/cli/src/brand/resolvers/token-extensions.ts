/**
 * Walk `design-system/tokens.json` for `$extensions.harness.brand` metadata.
 * Returns a path-keyed index of brand info per token.
 *
 * Returns null when no token carries a `harness.brand` extension —
 * BRAND-T* rules then silently skip (same pattern as drift's resolvers).
 *
 * Schema source: docs/knowledge/decisions/0028-brand-guidelines-source-of-truth.md
 *   (Schema sketch → $extensions example).
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface BrandTokenInfo {
  /** Dotted token path (e.g. "color.brand.500") */
  path: string;
  /** Token role per the brand schema (e.g. "primary") */
  role?: string;
  /** Contexts where this token is approved for use */
  approvedContexts: string[];
  /** Contexts where this token MUST NOT be used (audit-brand BRAND-T001) */
  forbiddenContexts: string[];
}

export interface BrandTokenIndex {
  byPath: Map<string, BrandTokenInfo>;
}

export function loadBrandTokenIndex(projectRoot: string): BrandTokenIndex | null {
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
  const idx: BrandTokenIndex = { byPath: new Map() };
  walk(parsed as Record<string, unknown>, [], idx);
  return idx.byPath.size > 0 ? idx : null;
}

function walk(node: Record<string, unknown>, breadcrumb: string[], idx: BrandTokenIndex): void {
  if ('$value' in node) {
    const tokenPath = breadcrumb.join('.');
    const brandExt = extractBrandExtension(node.$extensions);
    if (brandExt !== null) {
      idx.byPath.set(tokenPath, { ...brandExt, path: tokenPath });
    }
    return;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      walk(value as Record<string, unknown>, [...breadcrumb, key], idx);
    }
  }
}

function extractBrandExtension(extensions: unknown): Omit<BrandTokenInfo, 'path'> | null {
  if (typeof extensions !== 'object' || extensions === null) return null;
  const harness = (extensions as Record<string, unknown>)['harness'];
  if (typeof harness !== 'object' || harness === null) return null;
  const brand = (harness as Record<string, unknown>)['brand'];
  if (typeof brand !== 'object' || brand === null) return null;
  const b = brand as Record<string, unknown>;
  const info: Omit<BrandTokenInfo, 'path'> = {
    approvedContexts: Array.isArray(b.approved_contexts)
      ? (b.approved_contexts as string[]).filter((s) => typeof s === 'string')
      : [],
    forbiddenContexts: Array.isArray(b.forbidden_contexts)
      ? (b.forbidden_contexts as string[]).filter((s) => typeof s === 'string')
      : [],
  };
  if (typeof b.role === 'string') info.role = b.role;
  return info;
}
