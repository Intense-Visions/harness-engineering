// packages/core/src/fleet/claims/select.ts
//
// Pure, offline SELECT-phase composition helpers for the cross-run fleet
// work-claim lease (docs/changes/fleet-cross-run-claim-lease/proposal.md,
// Phase 2). NO network, NO `gh`, NO fs — every function is a pure transform
// over data the caller already fetched. All GitHub I/O (label scan, comment
// fetch, open-PR cross-check) lives in the member skill layer that CALLS
// these; this module only decides whether an item is claimed elsewhere.

import { isLeaseLive, parseClaimComment } from './index';

/**
 * Why SELECT drops a candidate. Mirrors roadmap-fleet's `crossCheck`
 * vocabulary: an open PR is the DURABLE claim (`in-progress-elsewhere`, the
 * existing drop); a live lease is a soft reservation (`claimed-elsewhere`).
 */
export type DropClassification = 'in-progress-elsewhere' | 'claimed-elsewhere';

/** Everything the caller already fetched about one candidate item. */
export interface ItemClaimContext {
  /** Item identifier (issue/PR number, e.g. '#1490'). */
  item: string;
  /** True if the existing merged/open-PR cross-check found an open PR. */
  hasOpenPr: boolean;
  /**
   * The `fleet:claimed` claim comment body + its GitHub-server `updated_at`,
   * or null/undefined when there is no claim (or the scan was unavailable).
   */
  claimComment?: { body: string; serverUpdatedAt: Date | string } | null;
}

export interface SelectOptions {
  /** Reader's current time (server-comparable ISO string or Date). */
  now: Date | string;
  /** This run's own runId — never drop on our OWN live claim. */
  myRunId?: string;
  /**
   * False ⇒ the `gh` claim-label scan was unavailable; degrade to the
   * open-PR cross-check only (SC4). Defaults to true.
   */
  claimScanAvailable?: boolean;
}

export interface ItemDecision {
  item: string;
  drop: boolean;
  reason: DropClassification | null;
}

/**
 * Decide whether one candidate should be dropped from SELECT. Precedence
 * (first match wins):
 *   1. An open PR is the DURABLE claim (D6 / SC3) → `in-progress-elsewhere`.
 *      Wins even after the lease label is removed and the lease has lapsed.
 *   2. A LIVE lease written by ANOTHER run → `claimed-elsewhere` (soft
 *      reservation). A stale lease, our own claim, a foreign/unparseable
 *      comment, or (SC4) an unavailable claim-scan are all ignored → keep.
 * Pure and non-throwing.
 */
export function classifyClaim(ctx: ItemClaimContext, opts: SelectOptions): ItemDecision {
  if (ctx.hasOpenPr) {
    return { item: ctx.item, drop: true, reason: 'in-progress-elsewhere' };
  }
  const scanOn = opts.claimScanAvailable !== false;
  if (scanOn && ctx.claimComment) {
    const claim = parseClaimComment(ctx.claimComment.body);
    if (
      claim &&
      claim.runId !== opts.myRunId &&
      isLeaseLive(claim, ctx.claimComment.serverUpdatedAt, opts.now)
    ) {
      return { item: ctx.item, drop: true, reason: 'claimed-elsewhere' };
    }
  }
  return { item: ctx.item, drop: false, reason: null };
}

/** Keep only the candidates SELECT should still build (`drop === false`). */
export function selectUnclaimed(
  items: ItemClaimContext[],
  opts: SelectOptions
): ItemClaimContext[] {
  return items.filter((ctx) => !classifyClaim(ctx, opts).drop);
}
