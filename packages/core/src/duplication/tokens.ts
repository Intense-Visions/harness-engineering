import { createHash } from 'node:crypto';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

/**
 * Type-2 clone normalization (spec decision D1).
 *
 * `Identifier` / `PrivateIdentifier` collapse to `I`; `String` / `Numeric` /
 * `Template` / `RegularExpression` / `JSXText` collapse to `L`; every other
 * token (`Keyword`, `Punctuator`, `Boolean`, `Null`, `JSXIdentifier`) is kept
 * verbatim. Collapsing identifiers is load-bearing, not incidental: the 16
 * orchestrator JSON-response copies span three different function names
 * (`sendJSON`, `sendJson`, `jsonResponse`) and cluster only once names
 * normalize away.
 *
 * `JSXIdentifier` is deliberately NOT collapsed. It covers element and
 * attribute names only — an identifier inside an expression container is a
 * plain `Identifier` token and still normalizes — and a tag name is structural,
 * closer to a keyword than to a variable name: `<input>` versus `<button>` is
 * different behavior, not a rename.
 *
 * That argument covers ELEMENT names; it does NOT cover attribute names, which
 * this keeps verbatim too. `<div className="x" tabIndex={1}>` tokenizes `div`,
 * `className` AND `tabIndex` all as `JSXIdentifier`, so a prop rename
 * (`onClick` to `onPress`) now defeats clustering — exactly the rename case
 * identifier normalization exists to absorb. Because normalization is
 * token-level it cannot tell the two apart, so the cost is accepted rather
 * than solved: a token stream carries no element/attribute distinction to
 * branch on. Collapsing it made
 * `() => <div className="x">hi</div>` and `() => <span className="x">hi</span>`
 * share the fingerprint `213c70b88dc1f373`. `.tsx` is in
 * `SUPPORTED_EXTENSIONS` and real `.tsx` classes are reported, so this is live,
 * not hypothetical.
 *
 * `Boolean` and `Null` are kept verbatim even though D1 says "literals to L":
 * a flag flip usually IS different logic, so `if (x === true)` and
 * `if (x === null)` should not alias.
 *
 * `Block` / `Line` comment tokens never appear here — typescript-estree keeps
 * comments in a separate `comments` array, so the stream is comment-free by
 * construction.
 */
const IDENTIFIER_TOKEN_TYPES = new Set<string>(['Identifier', 'PrivateIdentifier']);
const LITERAL_TOKEN_TYPES = new Set<string>([
  'String',
  'Numeric',
  'Template',
  'RegularExpression',
  // Both JSX element text (`hi`) and a JSX attribute's string value (`"x"`),
  // which typescript-estree also tokenizes as JSXText.
  'JSXText',
]);

/** The normalized placeholder for any identifier-shaped token. */
export const IDENTIFIER_PLACEHOLDER = 'I';
/** The normalized placeholder for any literal-shaped token. */
export const LITERAL_PLACEHOLDER = 'L';

/**
 * Normalize the tokens falling entirely inside `range` into a Type-2 stream.
 *
 * @param tokens - The full token array from `parse(src, { tokens: true })`.
 *   Must be range-sorted, as `parse` returns it — the range lookup is a binary
 *   search, so an unsorted array would silently select the wrong window.
 * @param range - A `[start, end]` character range; a token is included only
 *   when `token.range[0] >= range[0] && token.range[1] <= range[1]`.
 * @returns The normalized token stream, in source order.
 */
export function normalizeTokens(
  tokens: readonly TSESTree.Token[],
  range: readonly [number, number]
): string[] {
  const [start, end] = range;
  const stream: string[] = [];
  // `program.tokens` is range-sorted, so binary-search the first token that
  // could be inside the range instead of rescanning the file's whole token
  // array once per unit.
  //
  // Measured in token VISITS (a deterministic count, unlike a wall clock), at
  // the two scopes that matter, with each scope AND each denominator named —
  // the figure differs 8x between the scopes, and 6% between the two
  // denominators, so an unlabelled number here is how this cost came to be
  // understated in three places at once. Tokens below are counted over the
  // files that yielded at least one unit, which is the set that can contribute
  // visits at all; {@link buildCloneIndex}'s JSDoc carries the same
  // measurements over ALL eligible files.
  //
  //   - the spec's measured scope (`packages/` only, 2,065 eligible files,
  //     1,316,878 tokens in 1,577 unit-bearing files / 13,402 units): the
  //     per-unit rescan costs 26,055,026 visits, 19.8x the token count, of
  //     which `packages/orchestrator/src/orchestrator.ts` is 5,005,208 by
  //     itself (221 units x 22,648 tokens, 19.2% of the scope).
  //   - this repository's non-test sources, which is what the entropy detector
  //     actually scans (2,153 eligible files, 1,519,596 tokens in 1,646
  //     unit-bearing files / 17,064 units): the rescan costs 214,130,152
  //     visits, 140.9x the token count. TWO vendored Vite dependency
  //     pre-bundles under `docs/.vitepress/cache/` contribute 93,413,136
  //     (43.6%) and 81,613,016 (38.1%) of those by themselves — 81.7% between
  //     them, which is the point: the quadratic term is dominated by whichever
  //     pathological files happen to be in scope.
  //
  // After this change the same scan costs 1,976,826 visits — 1.30x the token
  // count, i.e. linear in the source rather than in units x tokens — a 108x
  // reduction. In wall-clock terms 20 full passes over the orchestrator file
  // went from 197.9 ms to 12.9 ms (15.3x).
  //
  // The streams are identical: the equivalence property in
  // `tests/duplication/tokens.test.ts` was written against the previous
  // implementation and passes unchanged against this one, and the token-visit
  // bound in `tests/entropy/detectors/duplication.perf.test.ts` is what fails
  // if this ever reverts to a per-unit rescan.
  let lo = 0;
  let hi = tokens.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tokens[mid]!.range[0] < start) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < tokens.length; i++) {
    const token = tokens[i]!;
    // `>` not `>=`, which is the conservative choice and not a hazard
    // averted. A zero-width token at exactly `end` would satisfy the
    // documented predicate (`range[0] >= start && range[1] <= end`) and `>=`
    // would drop it — but this parser emits no zero-width tokens (measured: 0
    // over 1,605,827 tokens in all 2,153 files the detector scans), and for
    // every non-zero-width token the two forms select identically. The `>=`
    // mutant accordingly survives the whole suite. `>` is kept because it
    // costs nothing and matches the documented predicate exactly; the test
    // below pins the predicate, not a discrimination between the two.
    if (token.range[0] > end) break;
    // The `start` boundary, correct by construction rather than by trusting
    // the binary search above to have landed on the right index. Under a
    // correct search this never fires (`lo` is the first token with
    // `range[0] >= start`), so it changes no selection and no visit count —
    // the perf proxy's bound is unchanged — but it means the loop body alone
    // implements the documented predicate, instead of half of it living in the
    // search.
    if (token.range[0] < start) continue;
    // `continue`, not `break`, is likewise defensive with no known trigger.
    // The stated scenario — a token that starts inside the range, ends outside
    // it (a long template literal cut mid-way), and is followed by a token
    // still fully inside — CANNOT occur with this parser: tokens are
    // non-overlapping and sorted (measured: 0 overlaps and 0 out-of-order
    // pairs over those same 1,605,827 tokens), so if `token.range[1] > end`
    // then every later token starts at or past that end and the `break` above
    // fires on the next iteration anyway. Mutating this to `break` passes the
    // entire suite. It stays `continue` because it is one comparison, it keeps
    // the loop's predicate identical to the pre-binary-search filter's, and it
    // is the only form that stays correct if a future parser (or a synthetic
    // token array a caller hands in) ever does overlap.
    if (token.range[1] > end) continue;
    if (IDENTIFIER_TOKEN_TYPES.has(token.type)) stream.push(IDENTIFIER_PLACEHOLDER);
    else if (LITERAL_TOKEN_TYPES.has(token.type)) stream.push(LITERAL_PLACEHOLDER);
    else stream.push(token.value);
  }
  return stream;
}

/**
 * Fingerprint a normalized token stream: sha1, truncated to 16 hex characters
 * (64 bits) for log and report readability. At this repository's scale
 * (8,165 fingerprinted units at HEAD) the expected collision count is
 * ~1.7e-12; a collision would
 * surface as one false clone class, never as corruption. Widen to the full
 * digest if a collision is ever observed.
 *
 * Observation is PARTIAL. `buildCloneIndex` groups on
 * `${fingerprint}:${tokenCount}` and records a `CloneIndex.collisions` entry
 * only when two colliding streams differ in LENGTH; two equal-length streams
 * that collide agree on `tokenCount`, so they group together and nothing here
 * or there can tell. "Zero collisions observed" is therefore a weaker claim
 * than "no collisions occurred".
 *
 * Tokens are joined with a space so that `['ab','c']` and `['a','bc']` cannot
 * alias to the same digest.
 */
export function fingerprintStream(stream: readonly string[]): string {
  return createHash('sha1').update(stream.join(' ')).digest('hex').slice(0, 16);
}
