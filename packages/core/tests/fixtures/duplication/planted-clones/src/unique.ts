export type UniqueMode = 'strict' | 'loose';

/**
 * Structurally unlike every other unit in this fixture — a `switch` over a
 * union, a `Map` accumulator and a `try` — and deliberately ABOVE the default
 * `minTokens` of 40, so it IS fingerprinted and forms a SINGLETON group: the
 * path counted in neither `classes` nor `classesSuppressed`.
 *
 * It holds exactly ONE extractable unit. The accumulation is a `for` loop
 * rather than `.reduce((carry, next) => ...)` on purpose: an arrow callback is
 * a second `DupUnit`, which would move the fixture's unit total off 12.
 */
export function classifyUnique(mode: UniqueMode, source: readonly number[]): Map<string, number> {
  const bucket = new Map<string, number>();
  switch (mode) {
    case 'strict': {
      for (const value of source) {
        const label = value % 2 === 0 ? 'even' : 'odd';
        bucket.set(label, (bucket.get(label) ?? 0) + value);
      }
      break;
    }
    default: {
      try {
        let carry = 0;
        for (const value of source) {
          carry += value;
        }
        bucket.set('all', carry);
      } catch {
        bucket.clear();
      }
      break;
    }
  }
  return bucket;
}
