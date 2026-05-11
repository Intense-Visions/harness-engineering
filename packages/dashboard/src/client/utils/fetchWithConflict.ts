import type { TrackerConflictBody } from '../../shared/types';
import { isTrackerConflictBody } from '../../shared/types';

export type FetchConflictResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; conflict?: TrackerConflictBody; error?: string };

/**
 * Wrapper around fetch() that recognizes the HTTP 409 TRACKER_CONFLICT shape
 * from the file-less roadmap endpoints (S3 claim, S5 roadmap-status, S6
 * roadmap-append after D-P7-A). Returns a discriminated union the caller
 * can dispatch on without re-implementing the shape check.
 */
export async function fetchWithConflict<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<FetchConflictResult<T>> {
  let res: Response;
  try {
    res = (await fetch(input, init)) as unknown as Response;
  } catch (err) {
    return { ok: false, status: 0, error: (err as Error).message ?? 'Network error' };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* tolerate empty bodies */
  }
  if (res.ok) {
    return { ok: true, status: res.status, data: body as T };
  }
  if (res.status === 409 && isTrackerConflictBody(body)) {
    return { ok: false, status: 409, conflict: body };
  }
  const error = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`;
  return { ok: false, status: res.status, error };
}
