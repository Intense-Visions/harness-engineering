import type { SanitizedResult } from '@harness-engineering/types';

/** The only field keys allowed in a SanitizedResult.fields. */
export const ALLOWED_FIELD_KEYS = [
  'event_name',
  'count',
  'timestamp_bucket',
  'error_signature',
  'latency_ms',
  'category',
] as const;

/** Regex that rejects any field name considered PII per Decision 7. */
export const PII_FIELD_DENYLIST =
  /^(email|user_id|session_id|ip|name|phone|address|message|content|payload)$/i;

const ALLOWED_SET: ReadonlySet<string> = new Set(ALLOWED_FIELD_KEYS);

export function isSanitizedResult(value: unknown): value is SanitizedResult {
  if (!value || typeof value !== 'object') return false;
  const v = value as { fields?: unknown; distributions?: unknown };
  if (!v.fields || typeof v.fields !== 'object') return false;
  for (const k of Object.keys(v.fields)) {
    if (!ALLOWED_SET.has(k)) return false;
    if (PII_FIELD_DENYLIST.test(k)) return false;
  }
  if (!v.distributions || typeof v.distributions !== 'object') return false;
  return true;
}

export function assertSanitized(value: unknown): asserts value is SanitizedResult {
  if (!isSanitizedResult(value)) {
    throw new Error('PII boundary violated: result is not a SanitizedResult');
  }
}
