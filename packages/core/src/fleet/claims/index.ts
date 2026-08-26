// packages/core/src/fleet/claims/index.ts
//
// Pure, offline primitives for the cross-run fleet work-claim lease
// (docs/changes/fleet-cross-run-claim-lease/proposal.md, Phase 1).
//
// NO network, NO `gh`, NO fs — every function here is a pure transform over
// strings/dates, matching the repo's injected-IO discipline. All GitHub I/O
// lives in the skill/orchestration layer that CALLS these.

import { FleetClaimSchema, type FleetClaim } from '@harness-engineering/types';

/** The GitHub label a claimed item carries; the cheap one-call SELECT filter. */
export const CLAIM_LABEL = 'fleet:claimed';

/** Default lease TTL: 12 minutes — tolerates one missed heartbeat. */
export const DEFAULT_LEASE_SECONDS = 720;

/** Heartbeat cadence: 4 minutes — renews the lease well within the TTL. */
export const HEARTBEAT_SECONDS = 240;

/** HTML marker line that unambiguously identifies a fleet claim comment. */
export const CLAIM_MARKER = '<!-- harness-fleet-claim -->';

/**
 * Render a claim as a GitHub comment body: the HTML marker line followed by a
 * fenced JSON block. Serializes `input` verbatim so a subsequent
 * {@link parseClaimComment} round-trips deep-equal.
 */
export function buildClaimBody(input: FleetClaim): string {
  return `${CLAIM_MARKER}\n\n\`\`\`json\n${JSON.stringify(input, null, 2)}\n\`\`\`\n`;
}

/**
 * Tolerantly parse a GitHub comment body into a {@link FleetClaim}. Returns
 * `null` — never throws — for a foreign comment (missing marker), a marked
 * comment with malformed JSON, or a marked comment whose payload fails the
 * schema.
 */
export function parseClaimComment(body: string): FleetClaim | null {
  if (typeof body !== 'string' || !body.includes(CLAIM_MARKER)) return null;
  const afterMarker = body.slice(body.indexOf(CLAIM_MARKER) + CLAIM_MARKER.length);
  const fence = /```json\s*\n([\s\S]*?)\n```/.exec(afterMarker);
  const payload = fence?.[1];
  if (payload === undefined) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(payload);
  } catch {
    return null;
  }
  const parsed = FleetClaimSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

/**
 * Is the lease still live? Staleness is computed from the GitHub SERVER
 * timestamp (`serverUpdatedAt`), NEVER `claim.claimedAt`, so a claim written
 * by a clock-skewed machine can neither prematurely expire nor over-trust.
 * Live iff `serverUpdatedAt + leaseSeconds > now`. An unparseable timestamp
 * is treated as not-live (fail safe → reclaimable).
 */
export function isLeaseLive(
  claim: FleetClaim,
  serverUpdatedAt: Date | string,
  now: Date | string
): boolean {
  const updatedMs = toMs(serverUpdatedAt);
  const nowMs = toMs(now);
  if (updatedMs === null || nowMs === null) return false;
  return updatedMs + claim.leaseSeconds * 1000 > nowMs;
}

function toMs(t: Date | string): number | null {
  const ms = t instanceof Date ? t.getTime() : Date.parse(t);
  return Number.isNaN(ms) ? null : ms;
}

// SELECT-phase composition helpers (Phase 2) — pure, offline.
export * from './select';
