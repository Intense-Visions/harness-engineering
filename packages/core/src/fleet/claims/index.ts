// packages/core/src/fleet/claims/index.ts
//
// Pure, offline primitives for the cross-run fleet work-claim lease
// (docs/changes/fleet-cross-run-claim-lease/proposal.md, Phase 1).
//
// NO network, NO `gh`, NO fs — every function here is a pure transform over
// strings/dates, matching the repo's injected-IO discipline. All GitHub I/O
// lives in the skill/orchestration layer that CALLS these.

import { type FleetClaim } from '@harness-engineering/types';

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
