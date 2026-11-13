/**
 * Multi-language craft unit extraction — the craft family's single seam onto
 * code-nav's tree-sitter outline.
 *
 * code-craft, naming-craft and test-craft reached for the TypeScript Compiler
 * API directly, so they could critique two of the six languages harness
 * supports. On the other four they extracted nothing and reported a clean pass
 * — a silent zero indistinguishable from "your code is fine".
 *
 * SHARED, not copied. Four laws live here (children recursion, dedup, kind
 * normalization, substantiveness), each with a named mutant. Four copies would
 * mean one mutant reddens one copy while three holes survive, and a third copy
 * would form a clone class under the repository's DRY floor (minInstances 3).
 *
 * Source: docs/changes/auto-wire-craft-at-review/proposal.md (Phase 2).
 */

import {
  detectLanguage,
  getOutlineFromSource,
  type CodeSymbol,
  type SupportedLanguage,
} from '@harness-engineering/core';

/** The unit kinds craft rubrics select on. Deliberately the same closed set as code-craft's `UnitKind`. */
export type CraftUnitKind = 'function' | 'method' | 'class';

export interface OutlineUnit {
  kind: CraftUnitKind;
  /** Declared name as written in the source. */
  name: string;
  /** 1-based line of the unit's first token. */
  line: number;
  /** 1-based line of the unit's last token. */
  endLine: number;
}

/**
 * Languages served by the outline path. TypeScript and JavaScript keep their
 * existing TS Compiler extractors: those are statement-aware (they can tell a
 * three-statement body from a three-line one) and they are the only path with
 * production mileage. Widening them here would risk the one thing that works
 * to gain nothing.
 */
const OUTLINE_LANGUAGES: ReadonlySet<SupportedLanguage> = new Set<SupportedLanguage>([
  'python',
  'go',
  'rust',
  'java',
]);

export function usesOutlineExtraction(filePath: string): boolean {
  const lang = detectLanguage(filePath);
  return lang !== null && OUTLINE_LANGUAGES.has(lang);
}

export async function extractOutlineUnits(
  source: string,
  filePath: string
): Promise<OutlineUnit[]> {
  if (!usesOutlineExtraction(filePath)) return [];
  const outline = await getOutlineFromSource(source, filePath);
  if (outline.error !== undefined) return [];

  const collected: Array<{ unit: OutlineUnit; key: string }> = [];
  for (const symbol of outline.symbols) collect(symbol, null, collected);

  // De-duplicate by (kind, qualifiedName), FIRST OCCURRENCE WINS.
  //
  // The key deliberately excludes `line`. Rust emits a type twice — once for
  // the `struct`, once for the `impl` — at DIFFERENT lines (measured: L1 and
  // L5), so the (kind, name, line) key named in the spec keeps both and every
  // Rust type costs two LLM prompts and yields two copies of every finding.
  //
  // The key includes the parent name because `Cart.add` and `Bag.add` in one
  // file are two units, and a bare-name key would silently drop one.
  const seen = new Set<string>();
  const units: OutlineUnit[] = [];
  for (const { unit, key } of collected) {
    if (seen.has(key)) continue;
    seen.add(key);
    units.push(unit);
  }
  return units;
}

function collect(
  symbol: CodeSymbol,
  parentName: string | null,
  out: Array<{ unit: OutlineUnit; key: string }>
): void {
  const kind = CRAFT_KIND_BY_SYMBOL_KIND[symbol.kind];
  if (kind !== undefined) {
    const qualified = parentName === null ? symbol.name : `${parentName}.${symbol.name}`;
    out.push({
      unit: { kind, name: symbol.name, line: symbol.line, endLine: symbol.endLine },
      key: `${kind}:${qualified}`,
    });
  }
  // Recursion happens whether or not the parent itself became a unit.
  for (const child of symbol.children ?? []) collect(child, symbol.name, out);
}

const CRAFT_KIND_BY_SYMBOL_KIND: Readonly<Record<string, CraftUnitKind>> = {
  function: 'function',
  method: 'method',
  class: 'class',
};
