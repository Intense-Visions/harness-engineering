import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC SHA-256 signing per spec D6.
 *   X-Harness-Signature: sha256=<lowercase-hex>
 * where the signature = HMAC-SHA256(secret, rawBody).
 *
 * Bridge verification (5-line snippet for the tunnel guide):
 *
 *   const expected = 'sha256=' + crypto
 *     .createHmac('sha256', secret)
 *     .update(rawBody)
 *     .digest('hex');
 *   if (!crypto.timingSafeEqual(Buffer.from(headerSig), Buffer.from(expected))) reject();
 */
export function sign(secret: string, body: string): string {
  const hex = createHmac('sha256', secret).update(body).digest('hex');
  return `sha256=${hex}`;
}

export function verify(secret: string, body: string, presented: string): boolean {
  const expected = sign(secret, body);
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

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
