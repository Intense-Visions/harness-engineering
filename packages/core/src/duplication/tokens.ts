import { createHash } from 'node:crypto';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

/**
 * Type-2 clone normalization (spec decision D1).
 *
 * `Identifier` / `PrivateIdentifier` / `JSXIdentifier` collapse to `I`;
 * `String` / `Numeric` / `Template` / `RegularExpression` / `JSXText` collapse
 * to `L`; every other token (`Keyword`, `Punctuator`, `Boolean`, `Null`) is
 * kept verbatim. Collapsing identifiers is load-bearing, not incidental: the
 * 16 orchestrator JSON-response copies span three different function names
 * (`sendJSON`, `sendJson`, `jsonResponse`) and cluster only once names
 * normalize away.
 *
 * `Block` / `Line` comment tokens never appear here — typescript-estree keeps
 * comments in a separate `comments` array, so the stream is comment-free by
 * construction.
 */
const IDENTIFIER_TOKEN_TYPES = new Set<string>([
  'Identifier',
  'PrivateIdentifier',
  'JSXIdentifier',
]);
const LITERAL_TOKEN_TYPES = new Set<string>([
  'String',
  'Numeric',
  'Template',
  'RegularExpression',
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
  for (const token of tokens) {
    if (token.range[0] < start || token.range[1] > end) continue;
    if (IDENTIFIER_TOKEN_TYPES.has(token.type)) stream.push(IDENTIFIER_PLACEHOLDER);
    else if (LITERAL_TOKEN_TYPES.has(token.type)) stream.push(LITERAL_PLACEHOLDER);
    else stream.push(token.value);
  }
  return stream;
}

/**
 * Fingerprint a normalized token stream: sha1, truncated to 16 hex characters
 * (64 bits) for log and report readability. At this repository's scale
 * (~8,000 units) the expected collision count is ~1.7e-12; a collision would
 * surface as one false clone class, never as corruption. Widen to the full
 * digest if a collision is ever observed.
 *
 * Tokens are joined with a space so that `['ab','c']` and `['a','bc']` cannot
 * alias to the same digest.
 */
export function fingerprintStream(stream: readonly string[]): string {
  return createHash('sha1').update(stream.join(' ')).digest('hex').slice(0, 16);
}
