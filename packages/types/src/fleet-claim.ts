// packages/types/src/fleet-claim.ts
//
// FleetClaim — the advisory cross-run work-claim lease record for the -fleet
// family (docs/changes/fleet-cross-run-claim-lease/proposal.md).
//
// A claim is published as a GitHub issue/PR comment: an HTML marker line plus
// a fenced JSON block, so two clones running a fleet concurrently auto-
// partition the backlog instead of duplicating it. This module owns ONLY the
// shape + schema; the pure render/parse/TTL logic lives in
// @harness-engineering/core (fleet/claims), and all GitHub I/O stays in the
// skill layer.

import { z } from 'zod';

/** Current version of the fleet claim payload envelope. Parsers tolerate an
 * absent or unknown `v`. */
export const FLEET_CLAIM_VERSION = 1;

/**
 * The advisory work-claim lease payload one fleet run publishes for one item.
 * - `v`            — envelope version (forward-compat; optional).
 * - `owner`        — GitHub login of the claiming run's operator.
 * - `runId`        — unique id of the claiming run (reclaim-race tiebreak).
 * - `fleet`        — which fleet took the claim (e.g. `'roadmap-fleet'`).
 * - `item`         — the item identifier claimed (issue/PR number, e.g. `'#1490'`).
 * - `claimedAt`    — ISO-8601 write time; ADVISORY ONLY. Staleness is computed
 *                    from the GitHub server `updated_at`, never this field.
 * - `leaseSeconds` — TTL seconds; live while `serverUpdatedAt + leaseSeconds > now`.
 *
 * Unknown keys are stripped (not rejected) for forward-tolerance; the claim
 * comment's HTML marker is the primary foreign-comment guard.
 */
export const FleetClaimSchema = z.object({
  v: z.number().int().positive().optional(),
  owner: z.string().min(1),
  runId: z.string().min(1),
  fleet: z.string().min(1),
  item: z.string().min(1),
  claimedAt: z.string().min(1),
  leaseSeconds: z.number().int().positive(),
});

export type FleetClaim = z.infer<typeof FleetClaimSchema>;
