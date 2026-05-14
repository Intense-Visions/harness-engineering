/**
 * Webhook signing + glob matching primitives.
 *
 * Phase 3 Task 3 ships `eventMatches` so `store.ts` can filter subscriptions
 * by event type. Task 4 expands this module with the full HMAC SHA-256
 * `sign`/`verify` pair.
 */

/**
 * Segment-glob matcher for subscription `events` patterns.
 * Splits on `.`. Each segment must match exactly or via `*` wildcard.
 * `**` and other minimatch features are intentionally out of scope.
 *
 *   eventMatches('interaction.*', 'interaction.created') → true
 *   eventMatches('interaction.*', 'interaction.foo.bar') → false (segment count mismatch)
 *   eventMatches('*', 'anything')                         → true (single segment)
 *   eventMatches('*.*', 'a.b')                            → true
 */
export function eventMatches(pattern: string, type: string): boolean {
  const pSegs = pattern.split('.');
  const tSegs = type.split('.');
  if (pSegs.length !== tSegs.length) return false;
  for (let i = 0; i < pSegs.length; i++) {
    if (pSegs[i] !== '*' && pSegs[i] !== tSegs[i]) return false;
  }
  return true;
}
