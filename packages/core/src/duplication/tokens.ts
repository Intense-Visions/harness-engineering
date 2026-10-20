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
  // the two scopes that matter and with each one named, because the figure
  // differs by 7x between them:
  //
  //   - the spec's measured scope (`packages/` only, 2,064 eligible files,
  //     1,315,964 tokens / 13,394 units): the per-unit rescan costs
  //     26,037,113 visits, 19.8x the token count, of which
  //     `packages/orchestrator/src/orchestrator.ts` is 5,005,208 by itself
  //     (221 units x 22,648 tokens).
  //   - this repository's non-test sources, which is what the entropy detector
  //     actually scans (2,152 eligible files, 1,518,682 tokens / 17,056
  //     units): the rescan costs 214,112,239 visits, 141.0x the token count.
  //     One vendored Vite dependency pre-bundle under `docs/.vitepress/cache/`
  //     (1,509 units over 61,904 tokens) contributes 93,413,136 of those by
  //     itself, which is the point: the quadratic term is dominated by
  //     whichever single pathological file happens to be in scope.
  //
  // After this change the same scan costs 1,975,735 visits — 1.30x the token
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
    // `>` not `>=`: a zero-width token at exactly `end` satisfies the
    // documented predicate (`range[0] >= start && range[1] <= end`), and
    // breaking on `>=` would silently drop it. The sort order guarantees
    // nothing after a token starting past `end` can qualify.
    if (token.range[0] > end) break;
    // `continue`, not `break`: a token may start inside the range and end
    // outside it (a long template literal cut mid-way), and a later token can
    // still be fully inside — this keeps the predicate identical to the
    // pre-change filter.
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
