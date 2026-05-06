import type { NamedLocalModelStatus } from '../types/orchestrator';

/**
 * Upsert a single local-model status into the previous array, keyed by
 * `backendName`. Preserves order: existing entries stay at their original
 * indices, and new backendNames append to the end. Returns a new array
 * reference; never mutates `prev`.
 *
 * Spec 2 SC39: each resolver broadcasts independently, so the dashboard
 * reducer must accumulate per-name without dropping entries delivered by
 * other backends. This helper is the single source of truth for that
 * contract — used by `useOrchestratorSocket` (WS path) and
 * `useLocalModelStatuses` (WS + HTTP-fallback paths).
 */
export function mergeLocalModelStatusByName(
  prev: NamedLocalModelStatus[],
  next: NamedLocalModelStatus
): NamedLocalModelStatus[] {
  const idx = prev.findIndex((s) => s.backendName === next.backendName);
  if (idx === -1) return [...prev, next];
  const merged = prev.slice();
  merged[idx] = next;
  return merged;
}

/**
 * Seed local-model statuses from an HTTP fallback payload without
 * overwriting entries already populated by the WebSocket. For each
 * incoming `backendName`, append only when no existing entry already
 * carries that name; otherwise drop (the WS-delivered value is fresher).
 *
 * Closes Spec 2 P4-S1 — the prior `prev.length === 0 ? json : prev`
 * guard stomped WS state when the HTTP fallback resolved after a
 * partial WS delivery.
 */
export function mergeLocalModelStatusesFromHttp(
  prev: NamedLocalModelStatus[],
  http: NamedLocalModelStatus[]
): NamedLocalModelStatus[] {
  let result = prev;
  for (const status of http) {
    if (result.some((p) => p.backendName === status.backendName)) continue;
    result = mergeLocalModelStatusByName(result, status);
  }
  return result;
}
