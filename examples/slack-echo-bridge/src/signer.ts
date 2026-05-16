import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * HMAC SHA-256 verification for harness Gateway API webhook deliveries.
 *
 * The orchestrator signs each delivery with:
 *   X-Harness-Signature: sha256=<lowercase-hex>
 * where signature = HMAC-SHA256(secret, rawBody).
 *
 * Source-of-truth: packages/orchestrator/src/gateway/webhooks/signer.ts
 * (cited in README §"Verifying signatures").
 *
 * The 5-line verification snippet that the spec §792 promised:
 *
 *   const expected = 'sha256=' + crypto
 *     .createHmac('sha256', secret)
 *     .update(rawBody)
 *     .digest('hex');
 *   if (!crypto.timingSafeEqual(Buffer.from(headerSig), Buffer.from(expected))) reject();
 *
 * `rawBody` MUST be the verbatim bytes of the request body — NOT a
 * JSON.parse → JSON.stringify round-trip (whitespace / key-order are not
 * preserved through that round-trip and the HMAC will mismatch).
 */
export function verify(secret: string, rawBody: Buffer, presented: string | undefined): boolean {
  if (typeof presented !== 'string' || presented.length === 0) return false;
  if (!presented.startsWith('sha256=')) return false;

  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);

  // timingSafeEqual throws on length mismatch; check length first so the
  // function returns a boolean for ANY input (no thrown TypeError surface
  // the caller has to handle).
  if (a.length !== b.length) return false;

  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
