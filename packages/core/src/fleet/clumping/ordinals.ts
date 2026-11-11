// packages/core/src/fleet/clumping/ordinals.ts
//
// The occurrence ordinal every seam needs and all four of them wrote out by
// hand.
//
// `ClumpableItem.id` MUST be unique within one `formClumps` call — the
// primitive THROWS on a duplicate rather than collapsing two items, which is
// right when the output is a filed issue and wrong when it is a crash. But no
// seam's native record carries a unique id: a craft finding has only
// `code:file:line` (two rubrics can fire on one line), a `ReviewFinding.id` is
// `domain-file-line` and repeats after fan-out, and a paginated `gh` dump
// repeats an issue number across a page boundary. So each seam numbers repeats.
//
// Written four times, the fourth was the dangerous one: `formatClumpedComments`
// numbers its findings in ONE loop to build the candidates and AGAIN in a second
// loop to emit the complement, and the two loops must assign IDENTICAL ordinals
// or the complement emits a duplicate comment for a finding that was already
// clumped. Nothing enforced that coupling — two `new Map()`s, two `?? 0`s, and
// a reader's promise that they stay in step. Numbering ONCE and reusing the
// result makes it structural.

/** One item with its occurrence ordinal among items sharing its key. */
export interface Numbered<T> {
  item: T;
  /** 0 for the first occurrence of this key, 1 for the next, and so on. */
  ordinal: number;
}

/**
 * Number each item by how many items before it shared its key.
 *
 * A function of the input ARRAY, so the numbering is deterministic for a given
 * run and a re-run over the same input produces the same ids — which is what
 * success criterion 7 asks of the clump id that hashes them.
 */
export function withOrdinals<T>(
  items: readonly T[],
  keyOf: (item: T) => string
): Array<Numbered<T>> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const key = keyOf(item);
    const ordinal = seen.get(key) ?? 0;
    seen.set(key, ordinal + 1);
    return { item, ordinal };
  });
}
