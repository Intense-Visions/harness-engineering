import { createHash } from 'node:crypto';
import type { HistoryEvent } from '../tracker';

/**
 * Normalize an event timestamp to second-granularity ISO-8601 for stable
 * hashing.
 *
 * Why: assignment-history records (file-backed source) carry day-granularity
 * `YYYY-MM-DD` dates, while tracker-emitted `HistoryEvent.at` values are
 * full ISO-8601 timestamps. Hashing the raw string would mean two same-day
 * same-type same-actor events from the source collide (re-runs cannot tell
 * them apart), while two same-second tracker events from different runs do
 * NOT collide (because sub-second jitter or timezone offsets perturb the
 * raw string). Both failure modes hurt idempotency.
 *
 * The fix: canonicalize `at` to `YYYY-MM-DDTHH:MM:SSZ` (UTC, second-precision)
 * before hashing. Day-granularity inputs become `YYYY-MM-DDT00:00:00Z`;
 * sub-second/timezone variations collapse to the same second.
 *
 * Invalid timestamps fall back to the raw string so the hash is still
 * deterministic but the upstream caller's bad input is preserved (callers
 * that need strict parsing should validate before calling this).
 */
function normalizeAt(at: string): string {
  // Already in second-granularity Z form? Skip Date round-trip to avoid
  // any platform-specific Date.toISOString quirks for already-canonical input.
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(at)) return at;
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  // Truncate to whole seconds, format as YYYY-MM-DDTHH:MM:SSZ.
  const seconds = Math.floor(d.getTime() / 1000) * 1000;
  return new Date(seconds).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

/** Short, deterministic, content-addressed hash of a history event. */
export function hashHistoryEvent(event: HistoryEvent): string {
  const detailsStr = JSON.stringify(event.details ?? {});
  const at = normalizeAt(event.at);
  const input = `${event.type}|${event.actor}|${at}|${detailsStr}`;
  return createHash('sha256').update(input).digest('hex').slice(0, 8);
}

const HASH_RE = /<!--\s*harness-history\s+hash:([0-9a-f]{8})\s*-->/i;

/** Returns the 8-hex hash embedded in a harness-history comment body, or null. */
export function parseHashFromCommentBody(commentBody: string): string | null {
  const match = commentBody.match(HASH_RE);
  return match ? match[1]! : null;
}

/** Build the canonical comment envelope for a history event. */
export function buildHistoryCommentBody(event: HistoryEvent): string {
  const hash = hashHistoryEvent(event);
  return `<!-- harness-history hash:${hash} -->\n${JSON.stringify(event)}`;
}
