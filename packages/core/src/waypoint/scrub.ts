/**
 * Client-side best-effort scrub — pure logic, no I/O.
 *
 * Runs before an event is spooled so the repo-local copy is already mostly
 * clean. This pass is ADVISORY: the authoritative, fail-closed scrub happens
 * at the (out-of-scope) ingest side, and an event failing it is never
 * persisted to a hosted ledger.
 *
 * Only string values inside `data` are scrubbed. Envelope attributes are
 * schema-shaped (ids, URIs, timestamps) and are not rewritten client-side —
 * quasi-identifying principals like `actor.onBehalfOf` are required by the
 * schema and handled by ingest policy, not redaction.
 */

import type { SdlcEvent } from '@harness-engineering/types';

/** Replacement marker for every redacted secret-shaped substring. */
export const REDACTED = '[REDACTED]';

/** Common secret shapes (best-effort; not a scanner, a seatbelt). */
const SECRET_PATTERNS: readonly RegExp[] = [
  /AKIA[0-9A-Z]{16}/g, // AWS access key id
  /gh[pousr]_[A-Za-z0-9]{20,}/g, // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
  /sk-[A-Za-z0-9_-]{20,}/g, // generic sk- API keys
  /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, // JWTs
  /[Bb]earer\s+[A-Za-z0-9._~+/=-]{16,}/g, // bearer tokens
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, // PEM
  /\b(password|passwd|secret|token|api[_-]?key)\s*[=:]\s*\S+/gi, // k=v pairs
];

interface ScrubState {
  redactions: number;
}

function scrubString(value: string, state: ScrubState): string {
  let out = value;
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, () => {
      state.redactions += 1;
      return REDACTED;
    });
  }
  return out;
}

function scrubValue(value: unknown, state: ScrubState): unknown {
  if (typeof value === 'string') {
    return scrubString(value, state);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => scrubValue(entry, state));
  }
  if (typeof value === 'object' && value !== null) {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = scrubValue(entry, state);
    }
    return out;
  }
  return value;
}

/** Result of a best-effort scrub: the (possibly copied) event + count. */
export interface ScrubOutcome {
  readonly event: SdlcEvent;
  /** Number of secret-shaped substrings redacted from `data`. */
  readonly redactions: number;
}

/** Returns a copy of `event` with secret-shaped `data` strings redacted. */
export function bestEffortScrub(event: SdlcEvent): ScrubOutcome {
  if (event.data === undefined) {
    return { event, redactions: 0 };
  }
  const state: ScrubState = { redactions: 0 };
  const data = scrubValue(event.data, state) as Readonly<Record<string, unknown>>;
  if (state.redactions === 0) {
    return { event, redactions: 0 };
  }
  return { event: { ...event, data }, redactions: state.redactions };
}
