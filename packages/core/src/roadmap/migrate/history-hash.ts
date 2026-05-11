import { createHash } from 'node:crypto';
import type { HistoryEvent } from '../tracker';

/** Short, deterministic, content-addressed hash of a history event. */
export function hashHistoryEvent(event: HistoryEvent): string {
  const detailsStr = JSON.stringify(event.details ?? {});
  const input = `${event.type}|${event.actor}|${event.at}|${detailsStr}`;
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
