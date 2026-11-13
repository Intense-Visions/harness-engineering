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

/**
 * Minimum line span for an outline-derived unit.
 *
 * The TS Compiler extractor filters on BODY STATEMENT COUNT (3+, or any
 * control flow). The outline exposes no statement count, so span is the
 * available proxy. Without it, a one-line `func tiny() int { return 1 }` is a
 * billable unit, and seven rubrics fire per unit against a default budget of
 * 100 prompts.
 *
 * A proxy, honestly: a 3-line Go struct passes. That is accepted — field
 * naming is critique-worthy, and the alternative bar ("a class must have
 * children") would drop EVERY Go struct, because Go methods are emitted top
 * level and never appear as children.
 */
const MIN_UNIT_LINES = 3;

function isSubstantive(symbol: CodeSymbol): boolean {
  return symbol.endLine - symbol.line + 1 >= MIN_UNIT_LINES;
}

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

  // De-duplicate, FIRST OCCURRENCE WINS. The key is kind-dependent, and the
  // asymmetry is the whole point:
  //
  //   class            -> (kind, qualifiedName)
  //   function/method  -> (kind, qualifiedName, line)
  //
  // WHY `line` IS EXCLUDED FOR `class`. Rust emits a type twice — once for the
  // `struct`, once for the `impl` — at DIFFERENT lines (measured: class:Cart
  // L1-3 and class:Cart L5-9). A key carrying `line` keeps both, so every Rust
  // type costs two LLM prompts and yields two copies of every finding.
  //
  // WHY `line` IS REQUIRED FOR function/method. `qualifiedName` is only as
  // precise as the parent the OUTLINE supplies, and for two of the four
  // languages it supplies none, so the key degenerates to a bare name and
  // collapses declarations that are genuinely distinct. Measured, all three:
  //
  //   go     `func (c *Cart) Add` and `func (b *Bag) Add` are both TOP LEVEL,
  //          so parentName is null for both and the key is `method:Add` twice.
  //          Bag.Add was silently dropped. This is the single most common
  //          shape Go has.
  //   rust   `impl From<i32> for Cart` and `impl From<u8> for Cart` both report
  //          parent `Cart` (getRustImplName returns the TYPE, not the trait),
  //          so both are `method:Cart.from`. The second was dropped.
  //   rust   `mod a { mod b { fn f } fn f }` — mod contents are spliced in at
  //          top level without the mod name, so both are `function:f`.
  //
  // WHY ADDING `line` BACK CANNOT RESURRECT A DUPLICATE. Measured across
  // struct+impl, two trait impls, an inherent impl split across two blocks,
  // impl-inside-mod, nested mods, and the two-same-named-methods shape in all
  // four languages: EVERY true duplicate is at kind `class`, and every
  // collision at function/method kind is a false one — two real declarations
  // being merged. A method node is reachable by exactly one walk (root
  // children, mod-body recursion, or class children), never two.
  //
  // KNOWN RESIDUAL, recorded not solved: the surviving units are correct but
  // their `name` is still ambiguous to a human — two findings both reading
  // `name=Add`, or `name=f`. The receiver is available in `symbol.signature`
  // (`func (c *Cart) Add(n int) {`) and the mod name is available at the
  // recursion site; qualifying the NAME changes finding identity and prompt
  // text, so it is a follow-up rather than a key fix.
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
  if (kind !== undefined && isSubstantive(symbol)) {
    const qualified = parentName === null ? symbol.name : `${parentName}.${symbol.name}`;
    out.push({
      unit: { kind, name: symbol.name, line: symbol.line, endLine: symbol.endLine },
      // See the key rationale in `extractOutlineUnits`. `class` is the only
      // kind that genuinely double-emits, and it is the only kind whose key
      // omits `line`.
      key: kind === 'class' ? `${kind}:${qualified}` : `${kind}:${qualified}:${symbol.line}`,
    });
  }
  // Recursion happens whether or not the parent itself became a unit.
  for (const child of symbol.children ?? []) collect(child, symbol.name, out);
}

const CRAFT_KIND_BY_SYMBOL_KIND: Readonly<Record<string, CraftUnitKind>> = {
  function: 'function',
  method: 'method',
  class: 'class',
  /**
   * Go emits `type` for a struct (measured: `type:Cart`), and `CodeFinding.target.kind`
   * is the closed union 'function' | 'method' | 'class'. Normalizing here is
   * strictly cheaper than widening `appliesToKinds` across seven rubrics AND
   * widening `UnitKind` through the finding schema, the emitter and the MCP
   * surface — and it keeps one map as the single place a language's kinds are
   * reconciled.
   */
  type: 'class',
};
